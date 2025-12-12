import { create } from 'zustand';

type LayoutState = {
  isSidebarOpen: boolean;
  sidebarWidth: number;
  collapsedWidth: number;
  tabbarHeight: number;
  toggleSidebar: () => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  isSidebarOpen: true,
  sidebarWidth: 430,
  collapsedWidth: 0,
  tabbarHeight: 56,
  toggleSidebar: () =>
    set((state) => ({
      isSidebarOpen: !state.isSidebarOpen,
    })),
}));
