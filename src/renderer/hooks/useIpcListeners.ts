import { useEffect } from 'react';
import { useTabStore, WebTab } from '../state/tabStore';

export const useIpcListeners = () => {
  const { addTab, frameMap, updateTabTitle, updateTabUrl } = useTabStore();

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
      addTab(newTab);
    };

    // Handler for tab title/url updates from webview navigation
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
      // Update title and URL if provided
      if (payload.title) {
        updateTabTitle(tabId, payload.title);
      }
      if (payload.url) {
        updateTabUrl(tabId, payload.url);
      }
    };

    // Subscribe to both IPC events
    const unsubscribeNewTab = ipc.on('open-new-tab', handleOpenNewTab);
    const unsubscribeTitleUpdate = ipc.on(
      'tab-title-updated',
      handleTitleUpdate,
    );

    // Cleanup both subscriptions on unmount
    return () => {
      unsubscribeNewTab?.();
      unsubscribeTitleUpdate?.();
    };
  }, [addTab, frameMap, updateTabTitle, updateTabUrl]);
};
