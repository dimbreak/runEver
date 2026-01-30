import { create } from 'zustand';

const collapsedHeight = 54;
const expandedHeight = 104;

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

type LayoutState = {
  isSidebarOpen: boolean;
  sidebarWidth: number;
  collapsedWidth: number;
  tabbarHeight: number;
  bounds: Rectangle;
  toggleSidebar: () => void;
  toggleUrlBar: (showUrlBar: boolean) => void;
  isConfigOpen: boolean;
  toggleConfig: () => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  isSidebarOpen: true,
  sidebarWidth: 430,
  collapsedWidth: 0,
  tabbarHeight: expandedHeight,
  bounds: computeBounds(true, 430, 0, expandedHeight),
  toggleSidebar: () =>
    set((state) => ({
      isSidebarOpen: !state.isSidebarOpen,
      bounds: computeBounds(
        !state.isSidebarOpen,
        state.sidebarWidth,
        state.collapsedWidth,
        state.tabbarHeight,
      ),
    })),
  toggleUrlBar: (showUrlBar: boolean) =>
    set((state) => ({
      tabbarHeight: showUrlBar ? expandedHeight : collapsedHeight,
      bounds: computeBounds(
        state.isSidebarOpen,
        state.sidebarWidth,
        state.collapsedWidth,
        showUrlBar ? expandedHeight : collapsedHeight,
      ),
    })),
  isConfigOpen: false,
  toggleConfig: () => set((state) => ({ isConfigOpen: !state.isConfigOpen })),
}));
