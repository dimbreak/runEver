import * as React from 'react';
import { PanelRightClose, X, Plus, Loader2 } from 'lucide-react';
import { ToMainIpc } from '../../../contracts/toMain';

import { useAgentStoreV2 } from '../../state/agentStoreV2';
import { useLayoutStore } from '../../state/layoutStore';
import { MessageList } from './MessageList';
import { PromptTextArea } from './PromptTextArea';

export const AgentPanel: React.FC = () => {
  const {
    isSidebarOpen,
    toggleSidebar,
    sidebarWidth,
    collapsedWidth,
    tabbarHeight,
  } = useLayoutStore();
  const panelWidth = isSidebarOpen ? sidebarWidth : collapsedWidth;

  const {
    activeSessionId,
    sessions,
    switchSession,
    removeSession,
    promptRunningStatusBySessionId,
  } = useAgentStoreV2((state) => ({
    activeSessionId: state.activeSessionId,
    sessions: state.sessions,
    switchSession: state.switchSession,
    removeSession: state.removeSession,
    promptRunningStatusBySessionId: state.promptRunningStatusBySessionId,
  }));

  const runningAssistantMessageIdRef = React.useRef<number | null>(null);

  const updateWebViewLayout = React.useCallback(
    async (sidebarOpen: boolean) => {
      const { lastFrameId } = window as any;
      if (!lastFrameId) return;
      const width = sidebarOpen ? sidebarWidth : collapsedWidth;
      try {
        await ToMainIpc.operateTab.invoke({
          sessionId: activeSessionId ?? 0,
          id: lastFrameId,
          sidebarWidth: width,
          tabbarHeight,
        });
      } catch {
        // swallow layout errors to avoid blocking UI
      }
    },
    [collapsedWidth, sidebarWidth, tabbarHeight, activeSessionId],
  );

  React.useEffect(() => {
    updateWebViewLayout(isSidebarOpen);
  }, [isSidebarOpen, updateWebViewLayout]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden transition-[width] duration-200"
      style={{ width: `${panelWidth}px` }}
    >
      <div
        className={`flex h-full flex-col border-l border-slate-200 bg-white transition-all duration-200 ${
          isSidebarOpen
            ? 'translate-x-0 scale-100 opacity-100'
            : 'pointer-events-none translate-x-4 scale-95 opacity-0'
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-blue-50 px-4 py-3">
          <div className="flex flex-1 flex-wrap gap-1.5 text-[13px] font-medium">
            {Object.values(sessions).map((session) => {
              const isActive = activeSessionId === session.id;
              return (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => switchSession(session.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      switchSession(session.id);
                    }
                  }}
                  className={`group relative flex max-w-[150px] cursor-pointer items-center gap-2 rounded-md border px-2 py-1 transition-colors ${
                    isActive
                      ? 'border-blue-300 bg-white text-blue-900 shadow-sm'
                      : 'pointer-events-auto border-slate-300/60 bg-slate-100/50 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-800'
                  }`}
                  title={session.label || 'Session'}
                >
                  <div className="flex flex-1 items-center gap-1.5 truncate">
                    {['planning', 'thinking', 'running'].includes(
                      promptRunningStatusBySessionId[session.id],
                    ) && (
                      <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                    )}
                    {session.label || 'Session'}
                  </div>
                  <button
                    type="button"
                    disabled={Object.keys(sessions).length <= 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (Object.keys(sessions).length > 1) {
                        removeSession(session.id);
                      }
                    }}
                    className={`flex shrink-0 items-center justify-center rounded-sm p-0.5 opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-0 ${
                      isActive ? 'opacity-100' : ''
                    }`}
                  >
                    <X
                      size={14}
                      className="rounded-sm transition-colors hover:bg-slate-200 hover:text-red-500"
                    />
                  </button>
                </div>
              );
            })}
            <button
              title="New Session"
              type="button"
              className="pointer-events-auto flex items-center justify-center rounded-md border border-slate-300/60 bg-slate-100/50 px-2 py-1 text-slate-600 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-800"
              onClick={async () => {
                const res = await ToMainIpc.newSession.invoke(
                  activeSessionId ?? 0,
                );
                if (res.id !== undefined) {
                  switchSession(res.id);
                }
              }}
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={toggleSidebar}
              className="rounded-xl border border-slate-200 bg-slate-100 p-2 text-slate-600 shadow-sm transition hover:bg-slate-200"
              title={isSidebarOpen ? 'Hide Panel' : 'Open Panel'}
            >
              <PanelRightClose size={18} />
            </button>
          </div>
        </div>

        <MessageList activeSessionId={activeSessionId} />

        <PromptTextArea
          runningAssistantMessageIdRef={runningAssistantMessageIdRef}
          placeholder="Describe what you want to automate..."
        />
      </div>
    </div>
  );
};
