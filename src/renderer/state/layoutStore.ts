import { create } from 'zustand';

const collapsedHeight = 72;
const expandedHeight = 112;

type LayoutState = {
  isSidebarOpen: boolean;
  sidebarWidth: number;
  collapsedWidth: number;
  tabbarHeight: number;
  toggleSidebar: () => void;
  toggleUrlBar: (showUrlBar: boolean) => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  isSidebarOpen: true,
  sidebarWidth: 430,
  collapsedWidth: 0,
  tabbarHeight: expandedHeight,
  toggleSidebar: () =>
    set((state) => ({
      isSidebarOpen: !state.isSidebarOpen,
    })),
  toggleUrlBar: (showUrlBar: boolean) =>
    set((state) => ({
      tabbarHeight: showUrlBar ? expandedHeight : collapsedHeight,
    })),
}));
