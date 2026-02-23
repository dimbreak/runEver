import { RuneverHandler, WebViewHandler } from './webViewPreload';
import { ElectronHandler } from '../main/preload';

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electron: ElectronHandler;
    webView: WebViewHandler;
    runever: RuneverHandler;
    frameId?: number;
    sessionId?: number;
    electronDummyCursor?: HTMLDivElement;
    isPreloadContext?: boolean;
  }
}

export {};
