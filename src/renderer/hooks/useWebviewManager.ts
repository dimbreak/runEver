import { useEffect } from 'react';
import { useLayoutStore } from '../state/layoutStore';
import { useTabStore } from '../state/tabStore';

export const useWebviewManager = () => {
  const { sidebarWidth, collapsedWidth, tabbarHeight, isSidebarOpen } =
    useLayoutStore();
  const { tabs, activeTabId, frameMap, initialTabs, layoutTabs, closeAllTabs } =
    useTabStore();

  useEffect(() => {
    initialTabs();

    return () => {
      closeAllTabs();
    };
  }, [initialTabs, closeAllTabs]);

  useEffect(() => {
    const syncTabs = async () => {
      await layoutTabs({
        sidebarWidth: isSidebarOpen ? sidebarWidth : collapsedWidth,
        tabbarHeight,
        viewportWidth: window.innerWidth,
      });
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
    layoutTabs,
    sidebarWidth,
    tabbarHeight,
    tabs,
  ]);
};
