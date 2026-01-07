import * as React from 'react';
import { ToMainIpc } from '../../../contracts/toMain';
import { useAgentStore } from '../../state/agentStore';
import { useLayoutStore } from '../../state/layoutStore';
import { useTabStore } from '../../state/tabStore';
import { textToDoc } from '../../utils/contentUtils';
import { MessageList } from './MessageList';
import { PromptTextArea } from './PromptTextArea';

export const AgentPanel: React.FC = () => {
  const {
    isSidebarOpen,
    toggleSidebar,
    sidebarWidth,
    collapsedWidth,
    tabbarHeight,
    bounds,
  } = useLayoutStore();
  const { tabs, activeTabId } = useTabStore();
  const panelWidth = isSidebarOpen ? sidebarWidth : collapsedWidth;
  const { addMessage, ensureTab, setSessionSnapshot, isPromptRunning } =
    useAgentStore((state) => ({
      addMessage: state.addMessage,
      ensureTab: state.ensureTab,
      setSessionSnapshot: state.setSessionSnapshot,
      isPromptRunning: state.isPromptRunning,
    }));
  const runningAssistantMessageIdRef = React.useRef<number | null>(null);
  const sessionRefreshTimerRef = React.useRef<number | null>(null);

  const refreshSessionSnapshot = React.useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab || tab.frameId === -1) {
        setSessionSnapshot(tabId, null);
        return;
      }
      try {
        const res = await ToMainIpc.getLlmSessionSnapshot.invoke({
          frameId: tab.frameId,
        });
        if (
          'snapshot' in res &&
          res.snapshot &&
          typeof res.snapshot === 'object'
        ) {
          setSessionSnapshot(tabId, {
            frameId: tab.frameId,
            updatedAt: Date.now(),
            ...(res.snapshot as any),
          });
          return;
        }
        setSessionSnapshot(tabId, null);
      } catch (err) {
        console.error('session snapshot error:', err);
      }
    },
    [setSessionSnapshot, tabs],
  );

  const scheduleSessionRefresh = React.useCallback(
    (tabId: string) => {
      if (sessionRefreshTimerRef.current !== null) return;
      sessionRefreshTimerRef.current = window.setTimeout(() => {
        sessionRefreshTimerRef.current = null;
        refreshSessionSnapshot(tabId);
      }, 400);
    },
    [refreshSessionSnapshot],
  );

  const handleCapture = async () => {
    try {
      // Get the active tab
      const currentTab = tabs.find((t) => t.id === activeTabId);
      if (!currentTab) {
        if (activeTabId) {
          addMessage(activeTabId, {
            id: Date.now(),
            role: 'assistant',
            content: textToDoc('No active tab to capture.'),
            tag: 'Error',
          });
        }
        return;
      }

      // Capture screenshot using WebTab method
      const imageDataUri = await currentTab.captureScreenshot(bounds);

      if (imageDataUri) {
        addMessage(currentTab.id, {
          id: Date.now(),
          role: 'assistant',
          content: textToDoc('Captured current view.'),
          image: imageDataUri,
          tag: 'Screenshot',
        });
      } else {
        addMessage(currentTab.id, {
          id: Date.now(),
          role: 'assistant',
          content: textToDoc('Failed to capture screenshot.'),
          tag: 'Error',
        });
      }
    } catch (err) {
      if (activeTabId) {
        addMessage(activeTabId, {
          id: Date.now(),
          role: 'assistant',
          content: textToDoc(`Capture error: ${(err as Error).message}`),
          tag: 'Error',
        });
      }
    }
  };

  const updateWebViewLayout = React.useCallback(
    async (sidebarOpen: boolean) => {
      const { lastFrameId } = window as any;
      if (!lastFrameId) return;
      const width = sidebarOpen ? sidebarWidth : collapsedWidth;
      try {
        await ToMainIpc.operateTab.invoke({
          id: lastFrameId,
          sidebarWidth: width,
          tabbarHeight,
        });
      } catch {
        // swallow layout errors to avoid blocking UI
      }
    },
    [collapsedWidth, sidebarWidth, tabbarHeight],
  );

  React.useEffect(() => {
    updateWebViewLayout(isSidebarOpen);
  }, [isSidebarOpen, updateWebViewLayout]);

  React.useEffect(() => {
    return () => {
      if (sessionRefreshTimerRef.current !== null) {
        window.clearTimeout(sessionRefreshTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!activeTabId) return;
    ensureTab(activeTabId);
    refreshSessionSnapshot(activeTabId);
  }, [activeTabId, ensureTab, refreshSessionSnapshot]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden transition-[width] duration-200"
      style={{ width: `${panelWidth}px` }}
    >
      <div
        className={`flex h-full flex-col border-l border-slate-200 bg-white transition-all duration-200 ${
          isSidebarOpen
            ? 'opacity-100 scale-100 translate-x-0'
            : 'opacity-0 scale-95 translate-x-4 pointer-events-none'
        }`}
      >
        <div className="flex shrink-0 items-center gap-3 px-4 py-3 min-h-[88px] border-b border-slate-200 bg-blue-50">
          <div className="font-semibold text-slate-800 leading-tight">
            <div className="text-[13px] text-slate-500">Flowaway</div>
            <div className="text-[15px]">Agent</div>
          </div>
          <div className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={handleCapture}
              className="rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-amber-200/60 transition hover:-translate-y-[1px] hover:bg-amber-600"
            >
              Capture View
            </button>
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-200"
          >
            {isSidebarOpen ? 'Hide' : 'Open'}
          </button>
        </div>

        <MessageList
          activeTabId={activeTabId}
          isPromptRunning={isPromptRunning}
        />

        <PromptTextArea
          scheduleSessionRefresh={scheduleSessionRefresh}
          refreshSessionSnapshot={refreshSessionSnapshot}
          runningAssistantMessageIdRef={runningAssistantMessageIdRef}
          placeholder="Describe what you want to automate..."
        />
      </div>
    </div>
  );
};
