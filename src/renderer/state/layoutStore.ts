import { create } from 'zustand';

const collapsedHeight = 44;
const expandedHeight = 84;

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
  const activeSidebarWidth = isSidebarOpen ? sidebarWidth : collapsedWidth;
  const width = Math.max(320, window.innerWidth - activeSidebarWidth);
  const height = Math.max(320, window.innerHeight - tabbarHeight);
  return { x: 0, y: tabbarHeight, width, height };
};

type LayoutState = {
  isSidebarOpen: boolean;
  sidebarWidth: number;
  collapsedWidth: number;
  tabbarHeight: number;
  bounds: Rectangle;
  onLayoutChange: () => void;
  toggleSidebar: () => void;
  toggleUrlBar: (showUrlBar: boolean) => void;
  isConfigOpen: boolean;
  toggleConfig: () => void;
};

export const useLayoutStore = create<LayoutState>((set, get) => ({
  isSidebarOpen: true,
  sidebarWidth: 430,
  collapsedWidth: 0,
  tabbarHeight: expandedHeight,
  bounds: computeBounds(true, 430, 0, expandedHeight),
  onLayoutChange: () =>
    set((state) => ({
      bounds: computeBounds(
        state.isSidebarOpen,
        state.sidebarWidth,
        state.collapsedWidth,
        state.tabbarHeight,
      ),
    })),
  toggleSidebar: () => {
    set((state) => ({
      isSidebarOpen: !state.isSidebarOpen,
    }));
    get().onLayoutChange();
  },
  toggleUrlBar: (showUrlBar: boolean) => {
    set(() => ({
      tabbarHeight: showUrlBar ? expandedHeight : collapsedHeight,
    }));
    get().onLayoutChange();
  },
  isConfigOpen: false,
  toggleConfig: () => set((state) => ({ isConfigOpen: !state.isConfigOpen })),
}));
