import { useEffect } from 'react';
import { webviewService } from '../services/webviewService';
import { useLayoutStore } from '../state/layoutStore';
import { useTabStore } from '../state/tabStore';

/**
 * Computes the bounds for webview positioning based on sidebar and tabbar dimensions
 */
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

/**
 * Custom hook to manage the lifecycle of all webviews.
 * Handles:
 * - Creating webviews for new tabs
 * - Laying out and positioning webviews based on layout state
 * - Closing webviews when tabs are removed
 * - Responding to window resize events
 */
export const useWebviewManager = () => {
  const { sidebarWidth, collapsedWidth, tabbarHeight, isSidebarOpen } =
    useLayoutStore();
  const { tabs, activeTabId, frameMap, registerFrameId, removeFrameId } =
    useTabStore();

  useEffect(() => {
    // Early return if webview bridge is not ready
    if (!webviewService.hasBridge()) return () => {};

    /**
     * Synchronises tab state with webview state:
     * - Closes webviews for removed tabs
     * - Creates webviews for new tabs
     * - Updates layout for all webviews
     */
    const syncTabs = async () => {
      const bounds = computeBounds(
        isSidebarOpen,
        sidebarWidth,
        collapsedWidth,
        tabbarHeight,
      );

      // Find and close webviews for tabs that no longer exist
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

      // Create missing webviews and layout all existing ones
      const layoutTasks = tabs.map(async (tab) => {
        let frameId = frameMap.get(tab.id);

        // Create new webview if it doesn't exist
        if (!frameId) {
          frameId = await webviewService.createTab({
            url: tab.url,
            bounds,
          });
          if (!frameId) return;
          registerFrameId(tab.id, frameId);
        }

        // Layout the webview (show active, hide inactive)
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

    // Initial sync and setup resize listener
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
};
