import { Buffer } from 'buffer';
import type { Rectangle } from 'electron';
import { create } from 'zustand';
import { ToMainIpc } from '../../contracts/toMain';
import type { UploadedAttachment } from '../services/uploadService';
import type { PromptAttachment } from '../../schema/attachments';
import { webviewService } from '../services/webviewService';
import { resolveInitialUrl } from '../utils/formatter';

export class WebTab {
  id: string;
  title: string;
  url: string;
  type: 'webview' = 'webview';
  isRunning?: boolean;
  frameId: number = -1;
  lastPromptRequestId?: number;
  parentFrameId?: number;

  constructor(init: {
    id: string;
    title: string;
    url: string;
    isRunning?: boolean;
    frameId?: number;
    lastPromptRequestId?: number;
    parentFrameId?: number;
  }) {
    this.id = init.id;
    this.title = init.title;
    this.url = init.url;
    this.isRunning = init.isRunning;
    this.frameId = init.frameId ?? -1;
    this.lastPromptRequestId = init.lastPromptRequestId;
    this.parentFrameId = init.parentFrameId;
  }
  async runPrompt(
    prompt: string,
    args: Record<string, string>,
    handleResponse: (response: string) => void,
    attachments?: UploadedAttachment[],
    requestId?: number,
  ) {
    const actualRequestId =
      requestId ?? Date.now() * 100 + Math.floor(Math.random() * 100);
    this.lastPromptRequestId = actualRequestId;
    const finish = webviewService.registerPromptResponseHandler(
      actualRequestId,
      handleResponse,
    );
    try {
      const { error } = await ToMainIpc.runPrompt.invoke({
        frameId: this.frameId,
        prompt,
        requestId: actualRequestId,
        args,
        attachments: attachments?.map(
          (f): PromptAttachment => ({
            name: f.name,
            mimeType: f.mimeType,
            data: f.data,
          }),
        ),
      });
      if (error) throw new Error(error);
      return actualRequestId;
    } finally {
      finish();
    }
  }

  async stopPrompt(requestId?: number) {
    if (this.frameId === -1) return;
    const id = requestId ?? this.lastPromptRequestId;
    const { stopped, error } = await ToMainIpc.stopPrompt.invoke({
      frameId: this.frameId,
      requestId: id,
    });
    if (error) throw new Error(error);
    return stopped;
  }

  async captureScreenshot(bounds: {
    width: number;
    height: number;
  }): Promise<string | null> {
    // Validate frameId is set
    if (this.frameId === -1) {
      throw new Error('No active tab to capture - frameId not set');
    }

    const payload = {
      frameId: this.frameId,
      ttlHeight: bounds.height,
      ttlWidth: bounds.width,
      vpHeight: bounds.height,
      vpWidth: bounds.width,
      slices: [{ x: 0, y: 0 }],
    };

    const imgJpgs = await ToMainIpc.takeScreenshot.invoke(payload);

    if (Array.isArray(imgJpgs) && imgJpgs.length > 0) {
      const base64Img = Buffer.from(imgJpgs[0] as any).toString('base64');
      return `data:image/jpeg;base64,${base64Img}`;
    }

    return null;
  }

  async getNavigationState(): Promise<{
    canGoBack: boolean;
    canGoForward: boolean;
    url: string;
  } | null> {
    if (this.frameId === -1) return null;
    const res = await ToMainIpc.getTabNavigationState.invoke({
      frameId: this.frameId,
    });
    if ('error' in res) return null;
    return res;
  }

  async goBack() {
    if (this.frameId === -1) return null;
    const res = await ToMainIpc.navigateTabHistory.invoke({
      frameId: this.frameId,
      direction: 'back',
    });
    if ('error' in res) return null;
    return res;
  }

  async goForward() {
    if (this.frameId === -1) return null;
    const res = await ToMainIpc.navigateTabHistory.invoke({
      frameId: this.frameId,
      direction: 'forward',
    });
    if ('error' in res) return null;
    return res;
  }
}

type TabState = {
  tabs: WebTab[];
  activeTabId: string | null;
  frameMap: Map<string, number | undefined>;
  initialTabs: () => Promise<void>;
  setActiveTab: (id: string | null) => void;
  addTab: (tab: WebTab, bounds: Rectangle) => Promise<void>;
  closeTab: (id: string) => Promise<void>;
  removeTabByFrameId: (frameId: number) => void;
  closeAllTabs: () => Promise<void>;
  clearTabs: () => void;
  stopPrompt: (tabId?: string, requestId?: number) => Promise<void>;
  registerFrameId: (tabId: string, frameId: number) => void;
  removeFrameId: (tabId: string) => void;
  updateTabUrl: (tabId: string, url: string) => void;
  navigateTab: (tabId: string, url: string) => Promise<void>;
  layoutTabs: (params: {
    viewportWidth: number;
    bounds?: Rectangle;
    sidebarWidth?: number;
    tabbarHeight?: number;
  }) => Promise<void>;
  reorderTabs: (sourceId: string, targetId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
};

const initialTabs = [
  // new WebTab({
  //   id: 'tab-1',
  //   title: 'Google',
  //   url: 'https://www.google.com',
  //   isRunning: true,
  // }),
  new WebTab({
    id: 'tab-1',
    title: 'Google',
    url: 'https://www.bilibili.com/', // 'http://localhost:5175/?flow=register',
    isRunning: true,
  }),
  // new WebTab({
  //   id: 'tab-2',
  //   title: 'OpenAI',
  //   url: 'https://www.openai.com',
  // }),
];

const removeTabFromState = (
  state: Pick<TabState, 'tabs' | 'activeTabId' | 'frameMap'>,
  id: string,
) => {
  const nextTabs = state.tabs.filter((t) => t.id !== id);
  const wasActive = state.activeTabId === id;
  let nextActive = state.activeTabId;
  if (wasActive && nextTabs.length > 0) {
    nextActive = nextTabs[nextTabs.length - 1].id;
  } else if (state.activeTabId === id) {
    nextActive = null;
  }
  const nextFrameMap = new Map(state.frameMap);
  nextFrameMap.delete(id);
  return {
    tabs: nextTabs,
    activeTabId: nextActive,
    frameMap: nextFrameMap,
  };
};

export const useTabStore = create<TabState>((set, get) => ({
  tabs: initialTabs.map((tab) => new WebTab(tab)),
  activeTabId: initialTabs[0]?.id ?? null,
  frameMap: new Map(),
  initialTabs: async () => {
    if (!webviewService.hasBridge()) return;

    const { tabs, frameMap } = get();

    for (const [tabId, frameId] of frameMap.entries()) {
      if (!tabs.find((t) => t.id === tabId)) {
        await webviewService.closeTab({ frameId });
        get().removeFrameId(tabId);
      }
    }

    for (const tab of tabs) {
      const existingFrameId = get().frameMap.get(tab.id);
      if (!existingFrameId) {
        const frameId = await webviewService.createTab({
          url: resolveInitialUrl(tab.url),
        });
        if (frameId) {
          tab.frameId = frameId;
          get().registerFrameId(tab.id, frameId);
          await webviewService.layoutTab({
            frameId,
            visible: get().activeTabId === tab.id,
          });
        }
      }
    }
    set(() => ({ tabs: tabs.slice() }));
  },
  setActiveTab: (id) => {
    set(() => ({ activeTabId: id }));
  },
  addTab: async (tab, bounds: Rectangle) => {
    if (!webviewService.hasBridge()) return;

    const frameId = await webviewService.createTab({
      url: resolveInitialUrl(tab.url),
      bounds,
      parentFrameId: tab.parentFrameId,
    });
    if (!frameId) return;

    tab.frameId = frameId;
    get().registerFrameId(tab.id, frameId);
    set((state) => {
      const nextTabs = [...state.tabs, new WebTab(tab)];
      console.log('new tab', nextTabs);
      return { tabs: nextTabs, activeTabId: tab.id };
    });
  },
  closeTab: async (id) => {
    const { frameMap } = get();
    const frameId = frameMap.get(id);
    await webviewService.closeTab({ frameId: frameId ?? undefined });
    set((state) => removeTabFromState(state, id));
  },
  removeTabByFrameId: (frameId) => {
    const entry = Array.from(get().frameMap.entries()).find(
      ([, id]) => id === frameId,
    );
    if (!entry) return;
    const [tabId] = entry;
    set((state) => removeTabFromState(state, tabId));
  },

  closeAllTabs: async () => {
    if (!webviewService.hasBridge()) return;

    const { frameMap } = get();

    const closePromises = Array.from(frameMap.entries()).map(
      async ([tabId, frameId]) => {
        if (frameId !== undefined) {
          console.log('closing tab', tabId, frameId);
          await webviewService.closeTab({ frameId });
        }
      },
    );

    await Promise.all(closePromises);

    set(() => ({ activeTabId: null, frameMap: new Map() }));
  },
  clearTabs: () => {
    set(() => ({ tabs: [], activeTabId: null, frameMap: new Map() }));
  },
  stopPrompt: async (tabId, requestId) => {
    const id = tabId ?? get().activeTabId;
    if (!id) return;
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    await tab.stopPrompt(requestId);
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? new WebTab({
              id: t.id,
              title: t.title,
              url: t.url,
              isRunning: false,
              frameId: t.frameId,
              lastPromptRequestId: t.lastPromptRequestId,
            })
          : t,
      ),
    }));
  },
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
          ? // todo is this suggested practice? looks weird
            new WebTab({
              id: tab.id,
              title: tab.title,
              url,
              isRunning: tab.isRunning,
              frameId: tab.frameId,
              lastPromptRequestId: tab.lastPromptRequestId,
            })
          : tab,
      ),
    })),
  navigateTab: async (tabId, url) => {
    const nextUrl = url.trim();
    if (!nextUrl) return;

    get().updateTabUrl(tabId, nextUrl);

    const frameId = get().frameMap.get(tabId);
    if (!frameId) return;

    await webviewService.layoutTab({
      frameId,
      url: nextUrl,
    });
  },
  layoutTabs: async (params) => {
    if (!webviewService.hasBridge()) return;
    const { tabs, activeTabId, frameMap } = get();

    await Promise.all(
      tabs.map(async (tab) => {
        const frameId = frameMap.get(tab.id);
        if (!frameId) return;

        await webviewService.layoutTab({
          frameId,
          visible: activeTabId === tab.id,
          sidebarWidth: params.sidebarWidth,
          tabbarHeight: params.tabbarHeight,
          viewportWidth: params.viewportWidth,
          bounds: params.bounds,
        });
      }),
    );
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
              frameId: tab.frameId,
              lastPromptRequestId: tab.lastPromptRequestId,
            })
          : tab,
      ),
    })),
}));
