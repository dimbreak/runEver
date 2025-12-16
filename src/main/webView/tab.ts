import { app, BrowserWindow, Rectangle, WebContentsView } from 'electron';
import path from 'path';

export class TabWebView {
  url: string;

  webView: WebContentsView;

  frameIds = new Set<number>();

  constructor(
    public initUrl: string,
    public bounds: Rectangle,
    private mainWindow?: BrowserWindow,
  ) {
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

  initView() {
    const { webView } = this;
    const frameId = webView.webContents.id;
    this.frameIds.add(frameId);
    webView.webContents.on('did-frame-navigate', () => {
      webView.webContents.executeJavaScript(
        `window.postMessage({ frameId: ${frameId}})`,
      );
    });
    webView.webContents.setWindowOpenHandler(({ url }) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('open-new-tab', { url });
      }
      return { action: 'deny' };
    });
    webView.setBounds(this.bounds);
    webView.webContents.loadURL(this.url);
    webView.webContents.openDevTools();
  }
}
