import { app, Rectangle, WebContentsView } from 'electron';
import path from 'path';

export class TabWebView {
  id: string;

  url: string;

  webView: WebContentsView;

  constructor(
    public initUrl: string,
    public bounds: Rectangle,
  ) {
    this.id = TabWebView.generateId();
    this.url = initUrl;
    this.webView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        preload: app.isPackaged
          ? path.join(__dirname, 'webViewPreload.js')
          : path.join(__dirname, '../../.erb/dll/webViewPreload.js'),
      },
    });
    this.initView();
  }

  static generateId(): string {
    return Math.random().toString(36).slice(2);
  }

  initView() {
    const { webView } = this;
    webView.setBounds(this.bounds);
    webView.webContents.loadURL(this.url);
    webView.webContents.openDevTools();
    webView.webContents.executeJavaScript(
      `window.postMessage({ frameId: ${webView.webContents.id}})`,
    );
  }
}
