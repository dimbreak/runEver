import { app, BrowserWindow, Rectangle, WebContentsView } from 'electron';
import path from 'path';
import settings from 'electron-settings';
import { WireAction } from '../../injection/roles/system/executor.schema';
import { Util } from '../../injection/util';

export class TabWebView {
  url: string;

  webView: WebContentsView;

  frameIds = new Set<number>();

  mouseX: number = -1;
  mouseY: number = -1;

  actionSet: WireAction[] = [];
  actionSetArgs: Record<string, string> | undefined;
  actionSetLock: { wait: Promise<void>; unlock: () => void } = {
    wait: Promise.resolve(),
    unlock: () => {},
  };

  scrollAdjustment: number;

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
    this.scrollAdjustment =
      (settings.getSync('scrollAdjustment') as number | null) ?? 0;
    this.initView();
  }

  async setActions(actions: WireAction[], args: Record<string, string>) {
    await this.actionSetLock.wait;
    this.actionSet = actions;
    this.actionSetArgs = args;
    if (actions.length) {
      this.actionSetLock = Util.newLock();
    }
  }

  popAction(args: Record<string, string>, count = 1) {
    this.actionSet.splice(0, count);
    this.actionSetArgs = args;
    if (this.actionSet.length === 0) {
      this.actionSetLock.unlock();
    }
  }

  initView() {
    const { webView } = this;
    const frameId = webView.webContents.id;
    this.frameIds.add(frameId);
    webView.webContents.on('did-frame-navigate', () => {
      webView.webContents.executeJavaScript(
        `window.postMessage({ scrollAdjustment: ${this.scrollAdjustment}, frameId: ${frameId}, mouseX: ${this.mouseX}, mouseY: ${this.mouseY}${this.actionSet.length ? `, actionArgs: ${JSON.stringify(this.actionSetArgs ?? {})}, actions: ${JSON.stringify(this.actionSet)}` : ''}})`,
      );
    });
    webView.webContents.on('page-title-updated', (_event, title) => {
      const currentUrl = webView.webContents.getURL();
      this.mainWindow?.webContents.send('tab-title-updated', {
        frameId,
        title,
        url: currentUrl,
      });
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
