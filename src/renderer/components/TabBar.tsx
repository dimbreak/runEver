import * as React from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { webviewService } from '../services/webviewService';
import { useLayoutStore } from '../state/layoutStore';
import { useTabStore, WebTab } from '../state/tabStore';
import { NewTabButton } from './NewTabButton';
import { TabItem } from './TabItem';
import { Button } from './ui/button';
import { UrlBar } from './UrlBar';

const computeBounds = (
  isSidebarOpen: boolean,
  sidebarWidth: number,
  collapsedWidth: number,
  tabbarHeight: number,
) => {
  const padding = 12;
  const activeSidebarWidth = isSidebarOpen ? sidebarWidth : collapsedWidth;
  const width = Math.max(
    320,
    window.innerWidth - activeSidebarWidth - padding * 2,
  );
  const height = Math.max(320, window.innerHeight - tabbarHeight - padding * 2);
  return { x: padding, y: tabbarHeight + padding, width, height };
};

const Tabs: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ul className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-2">
    {children}
  </ul>
);

export const TabBar: React.FC = () => {
  const {
    toggleSidebar,
    sidebarWidth,
    collapsedWidth,
    tabbarHeight,
    isSidebarOpen,
    setTabbarHeight,
  } = useLayoutStore();
  const {
    tabs,
    activeTabId,
    addTab,
    frameMap,
    registerFrameId,
    removeFrameId,
    updateTabUrl,
    updateTabTitle,
  } = useTabStore();
  useEffect(() => {
    const handler = (_: any, payload: { url: string }) => {
      const newTab = new WebTab({
        id: `tab-${Date.now()}`,
        title: payload.url,
        url: payload.url,
      });
      addTab(newTab);
    };

    const ipc = window.electron?.ipcRenderer;
    const unsubscribe = ipc?.on('open-new-tab', handler);
    return () => {
      unsubscribe?.();
    };
  }, [addTab]);

  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    const handleTitleUpdate = (
      _event: any,
      payload: { frameId: number; title?: string; url?: string },
    ) => {
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
    const unsubscribe = ipc?.on('tab-title-updated', handleTitleUpdate);
    return () => {
      unsubscribe?.();
    };
  }, [frameMap, updateTabTitle, updateTabUrl]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );

  useEffect(() => {
    // Keep webview layout bounds in sync with the actual bar height.
    const expandedHeight = 112;
    const collapsedHeight = 72;
    setTabbarHeight(activeTab ? expandedHeight : collapsedHeight);
  }, [activeTab, setTabbarHeight]);

  const orderedTabs = useMemo(() => tabs, [tabs]);

  const handleUrlSubmit = useCallback(
    async (nextUrl: string) => {
      if (!activeTabId || !nextUrl) return;
      updateTabUrl(activeTabId, nextUrl);
      const frameId = frameMap.get(activeTabId);
      if (frameId) {
        await webviewService.layoutTab({
          frameId,
          url: nextUrl,
        });
      }
    },
    [activeTabId, frameMap, updateTabUrl],
  );

  // Manage all webviews here to avoid duplicate creations.
  useEffect(() => {
    if (!webviewService.hasBridge()) return () => {};

    const syncTabs = async () => {
      const bounds = computeBounds(
        isSidebarOpen,
        sidebarWidth,
        collapsedWidth,
        tabbarHeight,
      );

      const toClose = Array.from(frameMap.entries()).filter(
        ([tabId]) => !tabs.find((t) => t.id === tabId),
      );
      if (toClose.length) {
        await Promise.all(
          toClose.map(async ([tabId, frameId]) => {
            if (!frameId) return;
            await webviewService.closeTab({ frameId });
            removeFrameId(tabId);
          }),
        );
      }

      // Create missing and layout all
      const layoutTasks = tabs.map(async (tab) => {
        let frameId = frameMap.get(tab.id);
        if (!frameId) {
          frameId = await webviewService.createTab({
            url: tab.url,
            bounds,
          });
          if (!frameId) return;
          registerFrameId(tab.id, frameId);
        }
        const isActive = activeTabId === tab.id;
        await webviewService.layoutTab({
          frameId,
          visible: isActive,
          sidebarWidth: isSidebarOpen ? sidebarWidth : collapsedWidth,
          tabbarHeight,
          bounds,
        });
      });
      await Promise.all(layoutTasks);
    };

    syncTabs();
    window.addEventListener('resize', syncTabs);
    return () => {
      window.removeEventListener('resize', syncTabs);
    };
  }, [
    activeTabId,
    collapsedWidth,
    frameMap,
    isSidebarOpen,
    registerFrameId,
    removeFrameId,
    sidebarWidth,
    tabbarHeight,
    tabs,
  ]);

  return (
    <div className="flex h-full w-full flex-col gap-2 px-3 py-2 pb-3">
      <div className="flex w-full items-center gap-2">
        <Tabs>
          {orderedTabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            return (
              <TabItem
                key={tab.id}
                tabId={tab.id}
                label={tab.title}
                isActive={isActive}
              />
            );
          })}
        </Tabs>
        <div className="flex items-center gap-2 shrink-0">
          <NewTabButton />
          <Button type="button" onClick={toggleSidebar} size="sm">
            Open Agent
          </Button>
        </div>
      </div>
      {activeTab && <UrlBar url={activeTab.url} onSubmit={handleUrlSubmit} />}
    </div>
  );
};
