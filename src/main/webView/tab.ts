import { app, BrowserWindow, Rectangle, WebContentsView } from 'electron';
import path from 'path';
import settings from 'electron-settings';
import { WireActionWithWaitAndRisk } from '../../webView/roles/system/executor.schema';
import { Network } from '../../webView/network';
import { WebViewLlmSession } from './session';

export class TabWebView {
  url: string;

  webView: WebContentsView;

  frameIds = new Set<number>();

  mouseX: number = -1;
  mouseY: number = -1;

  scrollAdjustment: number;

  llmSession: WebViewLlmSession;

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
    this.llmSession = new WebViewLlmSession(this);
  }

  async pushActions() {
    this.webView.webContents.executeJavaScript(
      `window.webView.addActions(${JSON.stringify(this.llmSession.getRemainActions())}, ${JSON.stringify(this.llmSession.args)})`,
    );
  }

  actionDone(actionId: number, argsDelta: Record<string, string> | undefined) {
    this.llmSession.actionDone(actionId, argsDelta);
  }

  actionError(error: string, actionId: number) {
    this.llmSession.actionError(actionId, error);
  }

  initView() {
    const {
      webView: { webContents },
    } = this;
    const frameId = webContents.id;
    this.frameIds.add(frameId);
    let inflight = new Set<string>();
    webContents.on('did-frame-navigate', () => {
      inflight = new Set<string>();
      webContents.executeJavaScript(
        `window.postMessage({ scrollAdjustment: ${this.scrollAdjustment}, frameId: ${frameId}, mouseX: ${this.mouseX}, mouseY: ${this.mouseY}})`,
      );
      if (this.llmSession.actions.length) {
        this.pushActions();
      }
    });
    webContents.on('page-title-updated', (_event, title) => {
      const currentUrl = webContents.getURL();
      this.mainWindow?.webContents.send('tab-title-updated', {
        frameId,
        title,
        url: currentUrl,
      });
    });
    webContents.setWindowOpenHandler(({ url }) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('open-new-tab', { url });
      }
      return { action: 'deny' };
    });
    this.webView.setBounds(this.bounds);
    webContents.loadURL(this.url);
    webContents.openDevTools();
    webContents.debugger.attach('1.3');

    webContents.debugger
      .sendCommand('Network.enable')
      .then(() => {
        const idle2Timer: NodeJS.Timeout | null = null;
        const idle0Timer: NodeJS.Timeout | null = null;

        webContents.debugger.on('message', (_event, method, params) => {
          if (method === 'Network.requestWillBeSent') {
            if (Network.networkRequestFilter(params.request.url, params.type)) {
              inflight.add(params.requestId);
              if (inflight.size === 1) {
                if (idle2Timer) clearTimeout(idle2Timer);
                if (idle0Timer) clearTimeout(idle0Timer);
              }
            } else {
              return;
            }
          } else if (
            !(
              method === 'Network.loadingFinished' ||
              method === 'Network.loadingFailed'
            ) ||
            !inflight.delete(params.requestId)
          ) {
            return;
          }
          if (inflight.size < 4) {
            webContents.executeJavaScript(
              `window.postMessage({network: {inflight: ${inflight.size}}})`,
            );
          }
        });
      })
      .catch(console.error);
  }
}
