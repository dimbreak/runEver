import { create } from 'zustand';

export class WebTab {
  id: string;
  title: string;
  url: string;
  type: 'webview' = 'webview'; // webTab should must be webview type?
  isRunning?: boolean;

  constructor(init: {
    id: string; // should it be frame id or add another field
    title: string;
    url: string;
    isRunning?: boolean;
  }) {
    this.id = init.id;
    this.title = init.title;
    this.url = init.url;
    this.isRunning = init.isRunning;
  }
}

type TabState = {
  tabs: WebTab[];
  activeTabId: string | null;
  frameMap: Map<string, number | undefined>;
  setActiveTab: (id: string | null) => void;
  addTab: (tab: WebTab) => void;
  closeTab: (id: string) => void;
  registerFrameId: (tabId: string, frameId: number) => void;
  removeFrameId: (tabId: string) => void;
  updateTabUrl: (tabId: string, url: string) => void;
  reorderTabs: (sourceId: string, targetId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
};

const initialTabs = [
  new WebTab({
    id: 'tab-1',
    title: 'Google',
    url: 'https://www.google.com',
    isRunning: true,
  }),
  new WebTab({
    id: 'tab-2',
    title: 'OpenAI',
    url: 'https://www.openai.com',
  }),
];

export const useTabStore = create<TabState>((set) => ({
  tabs: initialTabs,
  activeTabId: initialTabs[0]?.id ?? null,
  frameMap: new Map(),
  setActiveTab: (id) => set(() => ({ activeTabId: id })),
  addTab: (tab) =>
    set((state) => {
      const nextTabs = [...state.tabs, tab];
      return { tabs: nextTabs, activeTabId: tab.id };
    }),
  closeTab: (id) =>
    set((state) => {
      const nextTabs = state.tabs.filter((t) => t.id !== id);
      const wasActive = state.activeTabId === id;
      let nextActive = state.activeTabId;
      if (wasActive && nextTabs.length > 0) {
        nextActive = nextTabs[nextTabs.length - 1].id;
      } else if (state.activeTabId === id) {
        nextActive = null;
      }
      return {
        tabs: nextTabs,
        activeTabId: nextActive,
        frameMap: state.frameMap,
      };
    }),
  registerFrameId: (tabId, frameId) =>
    set((state) => ({ frameMap: new Map(state.frameMap).set(tabId, frameId) })),
  removeFrameId: (tabId) =>
    set((state) => {
      const next = new Map(state.frameMap);
      next.delete(tabId);
      return { frameMap: next };
    }),
  updateTabUrl: (tabId, url) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? new WebTab({
              id: tab.id,
              title: tab.title,
              url,
              isRunning: tab.isRunning,
            })
          : tab,
      ),
    })),
  reorderTabs: (sourceId, targetId) =>
    set((state) => {
      if (sourceId === targetId) return state;
      const tabs = [...state.tabs];
      const fromIndex = tabs.findIndex((t) => t.id === sourceId);
      const toIndex = tabs.findIndex((t) => t.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return state;
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);
      return { tabs };
    }),
  updateTabTitle: (tabId, title) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? new WebTab({
              id: tab.id,
              title,
              url: tab.url,
              isRunning: tab.isRunning,
            })
          : tab,
      ),
    })),
}));
