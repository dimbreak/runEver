import {
  app,
  BrowserWindow,
  clipboard,
  ipcRenderer,
  Rectangle,
  WebContentsView,
} from 'electron';
import path from 'path';
import settings from 'electron-settings';
import { Network } from '../../webView/network';
import {
  WebViewLlmSession,
  WireActionWithWaitAndRec,
} from '../../agentic/session';
import { LlmApi } from '../llm/api';
import { Util } from '../../webView/util';
import { ToRendererIpc } from '../../contracts/toRenderer';

export class TabWebView {
  url: string;

  webView: WebContentsView;

  frameIds = new Set<number>();

  mouseX: number = -1;
  mouseY: number = -1;

  scrollAdjustment: number;

  llmSession: WebViewLlmSession;

  pageLoadedLock = Util.newLock();
  pageStartLoadingLock = Util.newLock();

  networkIdle0: Util.Lock | undefined;
  networkIdle2: Util.Lock | undefined;

  constructor(
    public initUrl: string,
    public bounds: Rectangle,
    private mainWindow: BrowserWindow,
  ) {
    this.pageStartLoadingLock.tryLock();
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

  async pushActions(actions?: WireActionWithWaitAndRec[]) {
    const pushActions = actions ?? this.llmSession.getRemainActions();
    console.log('pushActions:', pushActions);
    return this.webView.webContents.executeJavaScript(
      `(async ()=>await window.webView.execActions(${JSON.stringify(pushActions)}, ${JSON.stringify(this.llmSession.args)}))()`,
    );
  }

  actionDone(actionId: number, argsDelta: Record<string, string> | undefined) {
    this.llmSession.actionDone(actionId, argsDelta);
  }

  actionError(error: string, actionId: number) {
    this.llmSession.actionError(actionId, error);
  }

  async screenshot(x = 0, y = 0, capWidth = 0, capHeight = 0) {
    let width = capWidth;
    let height = capHeight;
    if (width === 0 && height === 0) {
      const rect = this.webView.getBounds();
      width = rect.width;
      height = rect.height;
    }
    return this.webView.webContents.capturePage({
      x,
      y,
      width,
      height,
    });
  }

  screenshotRect(screenshotRect: Electron.Rectangle) {
    const { width, height } = this.webView.getBounds();
    if (width > 1920 && height > 1080) {
      const x = Math.min(screenshotRect.x - 200, 0);
      const y = Math.min(screenshotRect.y - 200, 0);
      return this.screenshot(
        x,
        y,
        Math.max(screenshotRect.width + 400, width - x),
        Math.max(screenshotRect.height + 400, height - y),
      );
    }
    return this.screenshot(screenshotRect.x, screenshotRect.y);
  }

  initView() {
    const {
      webView: { webContents },
    } = this;
    const frameId = webContents.id;
    this.frameIds.add(frameId);
    const inflight = new Set<string>();
    webContents.on('did-start-navigation', (details) => {
      if (
        details.isMainFrame &&
        !details.isSameDocument &&
        this.url !== details.url
      ) {
        console.log('did-start-navigation:', details.url);
        this.url = details.url;
        this.pageStartLoadingLock.unlock();
        this.pageLoadedLock.tryLock();
      }
    });
    webContents.on(
      'did-frame-navigate',
      (ev, url, _code, _status, isMainFrame) => {
        if (isMainFrame) {
          console.log('did-frame-navigate:', url);
          this.url = url;
          this.pageStartLoadingLock.tryLock();
          inflight.clear();
          webContents.executeJavaScript(
            `window.postMessage({ scrollAdjustment: ${this.scrollAdjustment}, frameId: ${frameId}, mouseX: ${this.mouseX}, mouseY: ${this.mouseY}})`,
          );
          const actions = this.llmSession.getRemainActions();
          if (actions.length) {
            this.pushActions(actions);
          }
        }
      },
    );
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
    webContents.loadURL(
      this.initUrl,
      // `file://${path.resolve(__dirname, '../../testHtml/moveDom.html')}`,
    );
    webContents.openDevTools();
    [this.networkIdle0, this.networkIdle2] = Network.initMonitor(
      webContents,
      inflight,
    );
  }

  async runPrompt(
    requestId: number,
    prompt: string,
    args?: Record<string, string>,
    reasoningEffort?: LlmApi.ReasoningEffort,
    modelType?: LlmApi.LlmModelType,
  ): Promise<string | undefined> {
    try {
      const stream = this.llmSession.userPrompt(
        prompt,
        args,
        reasoningEffort,
        modelType,
      );
      let response;
      while ((response = await stream.next())) {
        if (!response.done) {
          this.pushPromptResponse(requestId, response.value);
        } else {
          break;
        }
      }
    } catch (e) {
      return Util.formatError(e);
    }
  }
  pushPromptResponse(requestId: number, chunk: string) {
    ToRendererIpc.promptResponse.send(this.mainWindow!.webContents, {
      requestId,
      chunk,
    });
  }
  clipboardLock: Promise<void> = Promise.resolve();
  async pasteText(input: string) {
    await this.clipboardLock;
    this.clipboardLock = new Promise(async (resolve) => {
      clipboard.writeText(input);
      const wc = this.webView.webContents;
      wc.focus();
      if (Util.isMac) {
        wc.sendInputEvent({
          type: 'keyDown',
          keyCode: 'Meta',
        });
        await Util.sleep(50 + Math.random() * 50);
        wc.sendInputEvent({
          type: 'keyDown',
          keyCode: 'v',
          modifiers: ['meta'],
        });
        await Util.sleep(150 + Math.random() * 150);
        wc.sendInputEvent({
          type: 'keyUp',
          keyCode: 'v',
          modifiers: ['meta'],
        });
        await Util.sleep(50 + Math.random() * 50);
        wc.sendInputEvent({
          type: 'keyUp',
          keyCode: 'Meta',
        });
      } else {
        wc.sendInputEvent({
          type: 'keyDown',
          keyCode: 'Control',
        });
        await Util.sleep(50 + Math.random() * 50);
        wc.sendInputEvent({
          type: 'keyDown',
          keyCode: 'v',
          modifiers: ['control'],
        });
        await Util.sleep(150 + Math.random() * 150);
        wc.sendInputEvent({
          type: 'keyUp',
          keyCode: 'v',
          modifiers: ['control'],
        });
        await Util.sleep(50 + Math.random() * 50);
        wc.sendInputEvent({
          type: 'keyUp',
          keyCode: 'Control',
        });
      }
      resolve();
    });
  }

  pageLoaded(frameId: number, scrollAdjustment: number | undefined) {
    console.log('pageLoaded:', this.url);
    this.pageLoadedLock.delayUnlock(500);
    this.frameIds.add(frameId);
    if (scrollAdjustment) {
      settings.setSync('scrollAdjustment', scrollAdjustment);
      this.scrollAdjustment = scrollAdjustment;
    }
  }
}
