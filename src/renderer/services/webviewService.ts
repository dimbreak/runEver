import type { Rectangle } from 'electron';
import { ToMianIpc } from '../../contracts/toMain';

type LayoutParams = {
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

export const webviewService = {
  hasBridge: hasIpc,

  async createTab(params: { url: string; bounds?: Rectangle }) {
    if (!hasIpc()) return undefined;
    console.info('createTab', params?.url, params?.bounds);
    const res = await ToMianIpc.createTab.invoke({
      url: params.url,
      bounds: params.bounds,
    });
    if ('id' in res) return res.id;
    throw new Error(res.error ?? 'Failed to create tab');
  },

  async layoutTab(params: LayoutParams) {
    if (!hasIpc()) return;
    const { frameId, tabId } = params;
    if (!frameId && !tabId) return;
    console.info('layoutTab', frameId, tabId, params.bounds);
    await ToMianIpc.operateTab.invoke({
      id: frameId ?? -1,
      bounds: params.bounds,
      sidebarWidth: params.sidebarWidth,
      tabbarHeight: params.tabbarHeight,
      visible: params.visible,
      url: params.url,
      viewportWidth: params.viewportWidth,
    });
  },

  async closeTab(params: { frameId?: number }) {
    if (!hasIpc()) return;
    const { frameId } = params;
    if (!frameId) return;
    console.info('closeTab', frameId);
    await ToMianIpc.operateTab.invoke({
      id: frameId ?? -1,
      close: true,
    });
  },
};
