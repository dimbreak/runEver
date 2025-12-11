import { create } from 'zustand';

type LayoutState = {
  sidebarOpen: boolean;
  sidebarWidth: number;
  collapsedWidth: number;
  tabbarHeight: number;
  toggleSidebar: () => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarOpen: true,
  sidebarWidth: 430,
  collapsedWidth: 0,
  tabbarHeight: 56,
  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),
}));
