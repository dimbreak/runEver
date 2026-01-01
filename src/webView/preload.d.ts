import { WebViewHandler } from './webViewPreload';
import { ElectronHandler } from '../main/preload';

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electron: ElectronHandler;
    webView: WebViewHandler;
    frameId?: number;
    electronDummyCursor?: HTMLDivElement;
    isPreloadContext?: boolean;
  }
}

export {};
