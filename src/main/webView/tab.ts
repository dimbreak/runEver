import {
  app,
  BrowserWindow,
  clipboard,
  Rectangle,
  WebContentsView,
} from 'electron';
import path from 'path';
import settings from 'electron-settings';
import fs from 'fs';
import { Network } from '../../webView/network';
import {
  WebViewLlmSession,
  WireActionWithWaitAndRec,
} from '../../agentic/session';
import { LlmApi } from '../llm/api';
import { Util } from '../../webView/util';
import { ToRendererIpc } from '../../contracts/toRenderer';

const testPrompt: { user: string; system: string } | null = null;

export class TabWebView {
  url: string;

  webView: WebContentsView;

  frameIds = new Set<number>();

  mouseX: number = -1;
  mouseY: number = -1;

  scrollAdjustment: number;

  llmSession: WebViewLlmSession | undefined;

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
  }

  stopPrompt(requestId?: number) {
    this.llmSession?.stopPrompt(requestId);
    this.pageLoadedLock.unlock();
    this.pageStartLoadingLock.unlock();
  }

  async pushActions(
    actions: WireActionWithWaitAndRec[],
    args: Record<string, any>,
  ) {
    console.log('pushActions:', actions);
    return this.webView.webContents.executeJavaScript(
      `(async ()=>await window.webView.execActions(${JSON.stringify(actions)}, ${JSON.stringify(args)}))()`,
    );
  }

  actionDone(actionId: number, argsDelta: Record<string, string> | undefined) {
    this.llmSession?.actionDone(actionId, argsDelta);
  }

  actionError(error: string, actionId: number) {
    this.llmSession?.actionError(actionId, error);
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
          if (this.llmSession) {
            this.llmSession.resumeAll();
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
    console.info('====>');
    console.info(this.llmSession);
    console.info('prompt:', prompt);
    console.info('testPrompt:', testPrompt);
    if (this.llmSession) {
      if (prompt === 'run test' && testPrompt) {
        const promises: Promise<string>[] = [];
        const query = LlmApi.queryLLMSession(testPrompt.system, 'test');
        for (let i = 0; i < 3; i++) {
          const stream = query(testPrompt.user, null, 'mid', 'low');
          promises.push(LlmApi.wrapStream(stream));
        }
        const result: string[] = await Promise.all(promises);
        console.info(
          'result:',
          `${app.getPath('userData')}/prompt-lab/test${new Date().toString()}.json`,
          result,
        );
        try {
          fs.mkdirSync(`${app.getPath('userData')}/prompt-lab`);
        } catch (e) {}
        fs.writeFileSync(
          `${app.getPath('userData')}/prompt-lab/test${new Date().toISOString()}.json`,
          JSON.stringify(result, null, 2),
        );
      } else {
        try {
          const stream = this.llmSession.startPrompt(
            requestId,
            prompt,
            args,
            reasoningEffort,
            modelType,
          );
          let response;
          console.info('stream:', stream);
          while ((response = await stream.next())) {
            if (!response.done) {
              console.info('pushPromptResponse:', response.value);
              this.pushPromptResponse(requestId, response.value);
            } else {
              break;
            }
          }
        } catch (e) {
          console.error('runPrompt error:', e);
          return Util.formatError(e);
        }
      }
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
    this.llmSession = new WebViewLlmSession(this);
  }
}
