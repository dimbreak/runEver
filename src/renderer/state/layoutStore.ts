import { create } from 'zustand';

type LayoutState = {
  isSidebarOpen: boolean;
  sidebarWidth: number;
  collapsedWidth: number;
  tabbarHeight: number;
  toggleSidebar: () => void;
  setTabbarHeight: (height: number) => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  isSidebarOpen: true,
  sidebarWidth: 430,
  collapsedWidth: 0,
  tabbarHeight: 112,
  toggleSidebar: () =>
    set((state) => ({
      isSidebarOpen: !state.isSidebarOpen,
    })),
  setTabbarHeight: (height) =>
    set((state) =>
      state.tabbarHeight === height ? state : { tabbarHeight: height },
    ),
}));
