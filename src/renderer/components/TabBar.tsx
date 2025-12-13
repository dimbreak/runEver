import { Plus, SquareTerminal, X } from 'lucide-react';
import * as React from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { useLayoutStore } from '../state/layoutStore';
import { useTabStore, WebTab } from '../state/tabStore';
import { webviewService } from '../services/webviewService';

const baseTab =
  'flex items-center gap-2 h-10 pl-3 pr-2 rounded-lg text-sm font-semibold transition-colors border';

const activeTab = 'bg-white text-slate-900 border-slate-200 shadow-sm';

const inactiveTab = 'text-slate-600 border-transparent hover:bg-slate-100';

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

export const TabBar: React.FC = () => {
  const {
    toggleSidebar,
    sidebarWidth,
    collapsedWidth,
    tabbarHeight,
    isSidebarOpen,
  } = useLayoutStore();
  const {
    tabs,
    activeTabId,
    setActiveTab,
    addTab,
    closeTab,
    frameMap,
    registerFrameId,
    removeFrameId,
  } = useTabStore();

  const handleTabClick = useCallback(
    (id: string | null) => () => setActiveTab(id),
    [setActiveTab],
  );

  const handleCloseTab = useCallback(
    (id: string) => async () => {
      const frameId = frameMap.get(id);
      await webviewService.closeTab({ frameId: frameId ?? undefined });
      closeTab(id);
    },
    [closeTab, frameMap],
  );

  const handleAddTab = useCallback(() => {
    const newTab = new WebTab({
      id: `tab-${Date.now()}`,
      title: 'New Tab',
      url: 'https://www.google.com',
    });
    addTab(newTab);
  }, [addTab]);

  const orderedTabs = useMemo(() => tabs, [tabs]);

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

      // Close removed tabs/webviews
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
    <ul className="flex w-full items-center gap-2 px-3">
      <li>
        <button
          type="button"
          onClick={handleTabClick(null)}
          className={`${baseTab} ${
            activeTabId === null ? activeTab : inactiveTab
          }`}
          title="Home"
        >
          <SquareTerminal className="w-5 h-5" />
        </button>
      </li>
      {orderedTabs.map((tab) => (
        <li key={tab.id}>
          <div
            className={`${baseTab} ${
              activeTabId === tab.id ? activeTab : inactiveTab
            }`}
          >
            <button
              type="button"
              onClick={handleTabClick(tab.id)}
              className="flex items-center gap-2"
            >
              {tab.title}
            </button>
            <button
              type="button"
              onClick={handleCloseTab(tab.id)}
              className="rounded-md p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              aria-label={`Close ${tab.title}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={handleAddTab}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Plus className="w-4 h-4" /> New Tab
        </button>
      </li>
      <li className="ml-auto">
        <button
          type="button"
          onClick={toggleSidebar}
          className="bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-semibold px-3 py-1.5 rounded-md transition-colors border border-blue-500"
        >
          Open Agent
        </button>
      </li>
    </ul>
  );
};
