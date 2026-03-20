import type { Rectangle } from 'electron';
import { create } from 'zustand';
import { ToMainIpc } from '../../contracts/toMain';
import { resolveInitialUrl } from '../utils/formatter';
import { type TabStatus } from '../../agentic/session';
import { useAgentStoreV2 } from './agentStoreV2';
import { useLayoutStore } from './layoutStore';
import { webviewService } from '../services/webviewService';

export class WebTab {
  id: number;
  title: string;
  url: string;
  type: 'webview' = 'webview';
  isRunning?: boolean;
  lastPromptRequestId?: number;
  parentFrameId?: number;

  constructor(init: {
    id: number;
    title: string;
    url: string;
    isRunning?: boolean;
    lastPromptRequestId?: number;
    parentFrameId?: number;
  }) {
    this.id = init.id;
    this.title = init.title;
    this.url = init.url;
    this.isRunning = init.isRunning;
    this.lastPromptRequestId = init.lastPromptRequestId;
    this.parentFrameId = init.parentFrameId;
  }

  async getNavigationState(): Promise<{
    canGoBack: boolean;
    canGoForward: boolean;
    url: string;
  } | null> {
    const frameId = this.id;
    if (frameId === undefined || frameId === -1) return null;
    const res = await ToMainIpc.getTabNavigationState.invoke({
      frameId,
    });
    if ('error' in res) return null;
    return res;
  }

  async goBack() {
    const frameId = this.id;
    if (frameId === undefined || frameId === -1) return null;
    const res = await ToMainIpc.navigateTabHistory.invoke({
      frameId,
      direction: 'back',
    });
    if ('error' in res) return null;
    return res;
  }

  async goForward() {
    const frameId = this.id;
    if (frameId === undefined || frameId === -1) return null;
    const res = await ToMainIpc.navigateTabHistory.invoke({
      frameId,
      direction: 'forward',
    });
    if ('error' in res) return null;
    return res;
  }
}

type WindowResizeParams = {
  viewportWidth: number;
  bounds?: Rectangle;
  sidebarWidth?: number;
  tabbarHeight?: number;
};

type TabState = {
  tabs: WebTab[];
  activeTabId: number | null;
  sessionId: number;
  windowResizeParams: WindowResizeParams | null;
  switchSession: (tabs: TabStatus[], sessionId: number) => Promise<void>;
  setActiveTab: (id: number | null) => Promise<void>;
  addTab: (tab: WebTab, bounds: Rectangle) => Promise<void>;
  closeTab: (id: number) => Promise<void>;
  closeAllTabs: () => Promise<void>;
  clearTabs: () => void;
  updateTabUrl: (tabId: number, url: string) => void;
  navigateTab: (tabId: number, url: string) => Promise<void>;
  onResize: (params: WindowResizeParams) => Promise<void>;
  reorderTabs: (sourceId: number, targetId: number) => void;
  updateTabTitle: (tabId: number, title: string) => void;
};

const removeTabFromState = (
  state: Pick<TabState, 'tabs' | 'activeTabId'>,
  id: number,
) => {
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
  };
};

export const useTabStore = create<TabState>((set, get) => {
  const hideTab = async (sessionId: number, frameId: number | null) => {
    if (frameId === null || frameId === undefined || frameId === -1) return;
    await webviewService.layoutTab({
      sessionId,
      frameId,
      visible: false,
    });
  };

  const showTab = async (
    sessionId: number,
    frameId: number | null,
    resizeParams: WindowResizeParams | null,
  ) => {
    if (frameId === null || frameId === undefined || frameId === -1) return;
    await webviewService.layoutTab({
      sessionId,
      frameId,
      visible: true,
      bounds: resizeParams?.bounds,
      sidebarWidth: resizeParams?.sidebarWidth,
      tabbarHeight: resizeParams?.tabbarHeight,
      viewportWidth: resizeParams?.viewportWidth,
    });
  };

  const syncTabVisibility = async (
    sessionId: number,
    tabs: WebTab[],
    activeTabId: number | null,
    resizeParams: WindowResizeParams | null,
  ) => {
    await Promise.all(
      tabs.map(async (tab) => {
        const frameId = tab.id;
        if (frameId === undefined || frameId === -1) return;
        await webviewService.layoutTab({
          sessionId,
          frameId,
          visible: activeTabId === frameId,
          bounds: activeTabId === frameId ? resizeParams?.bounds : undefined,
          sidebarWidth:
            activeTabId === frameId ? resizeParams?.sidebarWidth : undefined,
          tabbarHeight:
            activeTabId === frameId ? resizeParams?.tabbarHeight : undefined,
          viewportWidth:
            activeTabId === frameId ? resizeParams?.viewportWidth : undefined,
        });
      }),
    );
  };

  return {
    tabs: [],
    activeTabId: null,
    sessionId: -1,
    windowResizeParams: null,
    switchSession: async (tabs: TabStatus[], sessionId: number) => {
      console.log('initialTabs', tabs);
      if (get().sessionId !== -1) {
        const currentTabs = get().tabs;
        const statuses: TabStatus[] = currentTabs.map((t) => ({
          id: t.id,
          url: t.url,
          title: t.title,
          active: get().activeTabId === t.id,
        }));
        useAgentStoreV2.getState().syncTabsToSession(get().sessionId, statuses);
        Promise.all(
          currentTabs.map(async (tab) => {
            if (tab.id !== undefined && tab.id !== -1) {
              await hideTab(get().sessionId, tab.id);
            }
          }),
        ).catch(console.error);
      }
      if (tabs.length === 0) {
        set({ sessionId, tabs: [], activeTabId: null });
        const { bounds } = useLayoutStore.getState();
        await get().addTab(
          new WebTab({
            id: -1,
            title: 'New tab',
            url: 'https://google.com',
            isRunning: false,
          }),
          bounds,
        );
        return;
      }

      set(() => {
        let activeTabId: number | null = null;
        return {
          tabs: tabs.map((ts) => {
            if (ts.active) {
              activeTabId = ts.id;
            }
            return new WebTab({
              id: ts.id,
              title: ts.title,
              url: ts.url,
            });
          }),
          activeTabId: activeTabId ?? tabs[0]?.id ?? null,
          sessionId,
        };
      });
      const resizeParams = {
        viewportWidth: window.innerWidth,
        ...useLayoutStore.getState(),
      };
      set({ windowResizeParams: resizeParams });
      await syncTabVisibility(
        sessionId,
        get().tabs,
        get().activeTabId,
        resizeParams,
      );
    },
    setActiveTab: async (id) => {
      const { activeTabId, sessionId, windowResizeParams } = get();
      if (activeTabId === id) return;
      set(() => ({ activeTabId: id }));
      if (typeof id === 'number') {
        useAgentStoreV2.getState().switchTab(sessionId, id);
      }
      await hideTab(sessionId, activeTabId);
      await showTab(sessionId, id, windowResizeParams);
    },
    addTab: async (tab, bounds: Rectangle) => {
      if (!webviewService.hasBridge()) return;

      const previousActiveTabId = get().activeTabId;
      const frameId = await webviewService.createTab({
        sessionId: get().sessionId,
        url: resolveInitialUrl(tab.url),
        bounds,
        parentFrameId: tab.parentFrameId,
      });
      if (!frameId) return;
      tab.id = frameId;
      set((state) => {
        const nextTabs = [...state.tabs, new WebTab(tab)];
        return { tabs: nextTabs, activeTabId: tab.id };
      });
      if (typeof tab.id === 'number') {
        useAgentStoreV2.getState().switchTab(get().sessionId, tab.id);
      }
      await hideTab(get().sessionId, previousActiveTabId);
      await showTab(get().sessionId, tab.id, get().windowResizeParams);
    },
    closeTab: async (id) => {
      const wasActive = get().activeTabId === id;
      await webviewService.closeTab({
        frameId: id,
        sessionId: get().sessionId,
      });
      let nextActiveTabId: number | null = null;
      set((state) => {
        const nextState = removeTabFromState(state, id);
        nextActiveTabId = nextState.activeTabId;
        return nextState;
      });

      if (wasActive && nextActiveTabId !== null) {
        if (typeof nextActiveTabId === 'number') {
          useAgentStoreV2
            .getState()
            .switchTab(get().sessionId, nextActiveTabId);
        }
        await showTab(
          get().sessionId,
          nextActiveTabId,
          get().windowResizeParams,
        );
      }
    },
    closeAllTabs: async () => {
      if (!webviewService.hasBridge()) return;

      const { tabs } = get();

      const closePromises = tabs.map(async (tab) => {
        if (tab.id !== undefined && tab.id !== -1) {
          console.log('closing tab', tab.id);
          await webviewService.closeTab({ frameId: tab.id });
        }
      });

      await Promise.all(closePromises);

      set(() => ({ activeTabId: null }));
    },
    clearTabs: () => {
      set(() => ({ tabs: [], activeTabId: null }));
    },
    updateTabUrl: (tabId, url) =>
      set((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.id === tabId
            ? new WebTab({
                id: tab.id,
                title: tab.title,
                url,
                isRunning: tab.isRunning,
                lastPromptRequestId: tab.lastPromptRequestId,
                parentFrameId: tab.parentFrameId,
              })
            : tab,
        ),
      })),
    navigateTab: async (tabId, url) => {
      const nextUrl = url.trim();
      if (!nextUrl) return;

      await ToMainIpc.recordUrlVisit.invoke({
        url: nextUrl,
      });
      get().updateTabUrl(tabId, nextUrl);

      const frameId = tabId;
      if (frameId === undefined || frameId === -1) return;

      await webviewService.layoutTab({
        sessionId: get().sessionId,
        frameId,
        url: nextUrl,
      });
    },
    onResize: async (params) => {
      set({ windowResizeParams: params });
      await webviewService.onResize({
        sessionId: get().sessionId,
        bounds: params.bounds,
        sidebarWidth: params.sidebarWidth,
        tabbarHeight: params.tabbarHeight,
        viewportWidth: params.viewportWidth,
      });
    },
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
                lastPromptRequestId: tab.lastPromptRequestId,
                parentFrameId: tab.parentFrameId,
              })
            : tab,
        ),
      })),
  };
});
