import { useEffect } from 'react';
import { useTabStore, WebTab } from '../state/tabStore';
import { useLayoutStore } from '../state/layoutStore';

export const useIpcListeners = () => {
  const { addTab, frameMap, updateTabTitle, updateTabUrl } = useTabStore();
  const { bounds } = useLayoutStore();
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

    return () => {
      unsubscribeNewTab?.();
      unsubscribeTitleUpdate?.();
    };
  }, [addTab, frameMap, updateTabTitle, updateTabUrl, bounds]);
};
