import { useEffect } from 'react';
import { useLayoutStore } from '../state/layoutStore';
import { useTabStore } from '../state/tabStore';

export const useWebviewManagerHook = () => {
  const {
    sidebarWidth,
    collapsedWidth,
    tabbarHeight,
    isSidebarOpen,
    onLayoutChange,
    bounds,
  } = useLayoutStore();
  const { switchSession, layoutTabs, closeAllTabs } = useTabStore();

  useEffect(() => {
    const cleanup = () => {
      closeAllTabs();
    };

    window.addEventListener('beforeunload', cleanup);
    return () => window.removeEventListener('beforeunload', cleanup);
  }, [switchSession, closeAllTabs]);

  useEffect(() => {
    onLayoutChange();
    window.addEventListener('resize', onLayoutChange);

    return () => {
      window.removeEventListener('resize', onLayoutChange);
    };
  }, [onLayoutChange]);

  useEffect(() => {
    layoutTabs({
      sidebarWidth: isSidebarOpen ? sidebarWidth : collapsedWidth,
      tabbarHeight,
      viewportWidth: window.innerWidth,
      bounds,
    });
  }, [
    bounds,
    collapsedWidth,
    isSidebarOpen,
    layoutTabs,
    sidebarWidth,
    tabbarHeight,
  ]);
};
