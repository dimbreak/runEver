import type { Rectangle } from 'electron';
import { ToMainIpc } from '../../contracts/toMain';
import { ToRendererIpc } from '../../contracts/toRenderer';
import { useTabStore, WebTab } from '../state/tabStore';
import { useLayoutStore } from '../state/layoutStore';

type LayoutParams = {
  sessionId: number;
  frameId?: number;
  tabId?: string;
  bounds?: Rectangle;
  sidebarWidth?: number;
  tabbarHeight?: number;
  visible?: boolean;
  url?: string;
  viewportWidth?: number;
};

const hasIpc = () =>
  typeof window !== 'undefined' &&
  Boolean((window as any).electron?.ipcRenderer);

let promptResponseHandlers: Record<number, (response: string) => void> | null =
  null;
export const webviewService = {
  hasBridge: hasIpc,

  registerTabHandler() {
    ToRendererIpc.tab.on(
      (_, { tabId: frameId, url, actionId, triggerFrameId }) => {
        const { tabs, setActiveTab, addTab } = useTabStore.getState();
        const { bounds, toggleUrlBar } = useLayoutStore.getState();
        if (frameId === -1) {
          const newTab = new WebTab({
            id: -1,
            title: url ?? 'New Tab',
            url: url ?? '',
          });
          addTab(newTab, bounds);
        } else {
          const tab = tabs.find((t) => t.id === frameId);
          if (tab) {
            setActiveTab(tab.id);
            toggleUrlBar(true);
          } else if (actionId !== undefined) {
            ToMainIpc.actionError.invoke({
              frameId: triggerFrameId!,
              actionId,
              error: 'tab not found',
            });
            return;
          }
        }
        if (actionId !== undefined) {
          setTimeout(() => {
            ToMainIpc.actionDone.invoke({
              frameId: triggerFrameId!,
              actionId,
            });
          }, 100);
        }
      },
    );
  },

  registerPromptResponseHandler(
    thisRequestId: number,
    handler: (response: string) => void,
  ) {
    if (promptResponseHandlers === null) {
      promptResponseHandlers = {};
      ToRendererIpc.promptResponse.on((_, response) => {
        console.log('promptResponse', response);
        const { requestId, chunk } = response;
        const registeredHandler = promptResponseHandlers![requestId];
        if (registeredHandler) registeredHandler(chunk);
      });
    }
    promptResponseHandlers[thisRequestId] = handler;
    return () => {
      delete promptResponseHandlers![thisRequestId];
    };
  },

  async createTab(params: {
    sessionId: number;
    parentFrameId?: number;
    url: string;
    bounds?: Rectangle;
  }) {
    if (!hasIpc()) return undefined;
    console.info('createTab', params?.url, params?.bounds);
    const res = await ToMainIpc.createTab.invoke(params);
    if ('id' in res) return res.id;
    throw new Error(res.error ?? 'Failed to create tab');
  },

  async layoutTab(params: LayoutParams) {
    if (!hasIpc()) return;
    const { frameId, tabId } = params;
    if (!frameId && !tabId) return;
    await ToMainIpc.operateTab.invoke({
      sessionId: params.sessionId,
      id: frameId ?? -1,
      bounds: params.bounds,
      sidebarWidth: params.sidebarWidth,
      tabbarHeight: params.tabbarHeight,
      visible: params.visible,
      url: params.url,
      viewportWidth: params.viewportWidth,
    });
  },

  async closeTab(params: { frameId?: number; sessionId?: number }) {
    if (!hasIpc()) return;
    const { frameId } = params;
    if (!frameId) return;
    console.info('closeTab', frameId, ToMainIpc);
    await ToMainIpc.operateTab.invoke({
      sessionId: params.sessionId ?? -1,
      id: frameId ?? -1,
      close: true,
    });
  },
};
