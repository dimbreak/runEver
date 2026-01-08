import { useEffect } from 'react';
import { useTabStore, WebTab } from '../state/tabStore';
import { useLayoutStore } from '../state/layoutStore';
import { dialogService } from '../services/dialogService';
import { ToMainIpc } from '../../contracts/toMain';
import { useAgentStore } from '../state/agentStore';

export const useIpcListeners = () => {
  const { addTab, frameMap, updateTabTitle, updateTabUrl, removeTabByFrameId } =
    useTabStore();
  const { bounds } = useLayoutStore();
  const setSessionSnapshot = useAgentStore(
    (state) => state.setSessionSnapshot,
  );
  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    if (!ipc) return;

    // Handler for opening new tabs from main process
    const handleOpenNewTab = (_: any, payload: { url: string }) => {
      const newTab = new WebTab({
        id: `tab-${Date.now()}`,
        title: payload.url,
        url: payload.url,
      });
      addTab(newTab, bounds);
    };

    const handleTitleUpdate = (
      _event: any,
      payload: { frameId: number; title?: string; url?: string },
    ) => {
      // Find the tab ID associated with this frame ID
      const entry = Array.from(frameMap.entries()).find(
        ([, frameId]) => frameId === payload.frameId,
      );
      if (!entry) return;

      const [tabId] = entry;
      if (payload.title) {
        updateTabTitle(tabId, payload.title);
      }
      if (payload.url) {
        updateTabUrl(tabId, payload.url);
      }
    };

    const unsubscribeNewTab = ipc.on('open-new-tab', handleOpenNewTab);
    const unsubscribeTitleUpdate = ipc.on(
      'tab-title-updated',
      handleTitleUpdate,
    );
    const unsubscribeTabClosed = ipc.on(
      'tab-closed',
      (_event: any, payload: { frameId: number }) => {
        removeTabByFrameId(payload.frameId);
      },
    );
    const unsubscribeToUser = ipc.on(
      'to-user',
      async (_event: any, payload: any) => {
        if (!payload) return;
        if (payload.type !== 'prompt') return;
        const questions = payload.questions ?? {};
        let answer: Record<string, string> | null = null;
        try {
          answer = await dialogService.promptInput({
            title: payload.title,
            message: payload.message ?? 'Input required',
            questions,
            okText: 'OK',
            cancelText: 'Cancel',
          });
        } catch {
          answer = null;
        }
        const fallbackAnswer = Object.keys(questions).reduce(
          (acc, key) => ({ ...acc, [key]: '' }),
          {} as Record<string, string>,
        );
        await ToMainIpc.responsePromptInput.invoke({
          id: payload.responseId,
          answer: answer ?? fallbackAnswer,
        });
      },
    );
    const unsubscribeSessionSnapshot = ipc.on(
      'llm-session-snapshot',
      (_event: any, payload: { frameId: number; snapshot: unknown | null }) => {
        const entry = Array.from(frameMap.entries()).find(
          ([, frameId]) => frameId === payload.frameId,
        );
        if (!entry) return;
        const [tabId] = entry;
        if (payload.snapshot && typeof payload.snapshot === 'object') {
          setSessionSnapshot(tabId, {
            frameId: payload.frameId,
            updatedAt: Date.now(),
            ...(payload.snapshot as any),
          });
        } else {
          setSessionSnapshot(tabId, null);
        }
      },
    );

    return () => {
      unsubscribeNewTab?.();
      unsubscribeTitleUpdate?.();
      unsubscribeTabClosed?.();
      unsubscribeToUser?.();
      unsubscribeSessionSnapshot?.();
    };
  }, [
    addTab,
    frameMap,
    updateTabTitle,
    updateTabUrl,
    removeTabByFrameId,
    bounds,
    setSessionSnapshot,
  ]);
};
