import {
  app,
  BrowserWindow,
  clipboard,
  Menu,
  Rectangle,
  WebContentsView,
} from 'electron';
import settings from 'electron-settings';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import { CancelError, download } from 'electron-dl';
import { LlmApi } from '../../agentic/api';
import { WireActionWithWaitAndRec } from '../../agentic/types';
import { WebViewLlmSession } from '../../agentic/webviewLlmSession';
import { ToRendererIpc } from '../../contracts/toRenderer';
import { IframeProgressType } from '../../extensions/iframe/types';
import type { PromptAttachment } from '../../schema/attachments';
import { Network } from '../../webView/network';
import { Util } from '../../webView/util';
import { showSystemMessageBox } from '../dialogs';
import { isMac } from '../util';

export class TabWebView {
  url: string;

  webView: WebContentsView;

  frameIds = new Set<number>();

  mouseX: number = -1;
  mouseY: number = -1;

  scrollAdjustment: number;

  llmSession: WebViewLlmSession;

  pageLoadedLock = Util.newLock();

  networkIdle0: Util.Lock | undefined;
  networkIdle2: Util.Lock | undefined;

  loadingFrames = new Set<string>();

  constructor(
    public initUrl: string,
    public bounds: Rectangle,
    private mainWindow: BrowserWindow,
    llmSession: WebViewLlmSession,
  ) {
    this.url = this.initUrl;
    this.llmSession = llmSession;
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

  get isFocused() {
    return this.llmSession.isFocused(this);
  }

  focus() {
    this.webView.webContents.focus();
    this.llmSession.focusTab(this);
  }

  blur() {
    // no-op
  }

  stopPrompt(requestId?: number) {
    this.llmSession.stopPrompt(requestId);
    this.pageLoadedLock.unlock();
  }

  emitLlmSessionSnapshot(snapshot: unknown | null) {
    try {
      if (this.mainWindow?.isDestroyed()) return;
      const webContents = this.webView?.webContents;
      if (!webContents || webContents.isDestroyed()) return;
      ToRendererIpc.llmSessionSnapshot.send(this.mainWindow.webContents, {
        frameId: webContents.id,
        snapshot,
      });
    } catch (err) {
      console.error('emitLlmSessionSnapshot failed:', err);
    }
  }

  async confirmHighRiskAction(actionIntent: string) {
    try {
      if (!this.mainWindow.isDestroyed()) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    } catch {
      // ignore focus errors
    }
    const res = await showSystemMessageBox(this.mainWindow, {
      type: 'warning',
      title: 'High risk action',
      message: actionIntent,
      detail: 'Approve to continue running this task, or Cancel to stop it.',
      buttons: ['Approve', 'Cancel'],
    });
    return !('error' in res) && res.response === 0;
  }

  async pushActions(
    actions: WireActionWithWaitAndRec[],
    args: Record<string, any>,
  ) {
    const actionStr = JSON.stringify(actions);
    console.log('pushActions:', actionStr);
    return this.webView.webContents.executeJavaScript(
      `(async ()=>await window.webView.execActions(${actionStr}, ${JSON.stringify(args)}))()`,
    );
  }

  actionDone(
    actionId: number,
    argsDelta: Record<string, string> | undefined,
    iframeId?: string,
  ) {
    this.llmSession.actionDone(actionId, argsDelta);
  }

  actionError(error: string, actionId: number, iframeId?: string) {
    this.llmSession.actionError(actionId, error);
  }

  async screenshot(
    x = 0,
    y = 0,
    capWidth = 0,
    capHeight = 0,
    filename: string | undefined = undefined,
  ) {
    let width = capWidth;
    let height = capHeight;
    if (width === 0 && height === 0) {
      const rect = this.webView.getBounds();
      width = rect.width;
      height = rect.height;
    }
    const shot = this.webView.webContents.capturePage({
      x,
      y,
      width,
      height,
    });
    if (filename) {
      const data = await shot;
      const imgPath = `${app.getPath('downloads')}/${filename.includes('.') ? filename : `${filename}.png`}`;
      fs.writeFileSync(imgPath, (await shot).toPNG());
      this.llmSession.readableFiles.set(filename, {
        name: filename,
        mimeType: 'image/png',
        data: data.toPNG(),
        path: imgPath,
      });

      return data;
    }
    return shot;
  }

  initView() {
    const {
      webView: { webContents },
    } = this;
    const frameId = webContents.id;
    this.frameIds.add(frameId);
    const inflight = new Set<string>();
    webContents.userAgent = `Mozilla/5.0 (${isMac ? 'Macintosh; Intel Mac OS X 10.15; rv:147.0' : 'Windows NT 10.0; Win64; x64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36`;
    const unlockLoaded = () => {
      console.log('Page loaded unlockLoaded');
      // Fallback: do not rely solely on bindFrameId to unblock navigation waits.
      // Some navigations (or cross-origin pages) may not re-run our bridge init.
      this.pageLoadedLock.delayUnlock(500);
    };
    webContents.on('did-finish-load', unlockLoaded);
    webContents.on('did-stop-loading', unlockLoaded);
    webContents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && this.url !== details.url) {
        this.mainWindow?.webContents.send('tab-title-updated', {
          frameId,
          url: details.url,
        });
        if (!details.isSameDocument) {
          console.log('did-start-navigation:', details.url);
          this.url = details.url;
          this.loadFrameStart('MAIN');
        }
      }
    });

    webContents.on(
      'did-frame-navigate',
      (ev, url, _code, _status, isMainFrame) => {
        if (isMainFrame) {
          console.log('did-frame-navigate:', url);
          this.url = url;
          inflight.clear();
          webContents.executeJavaScript(
            `window.postMessage({ scrollAdjustment: ${this.scrollAdjustment}, frameId: ${frameId}, mouseX: ${this.mouseX}, mouseY: ${this.mouseY}})`,
          );
          this.llmSession.resumeAll();
          this.loadedFrame('MAIN');
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
        this.mainWindow.webContents.send('open-new-tab', {
          url,
          parentFrameId: frameId,
        });
      }
      return { action: 'deny' };
    });
    this.webView.setBounds(this.bounds);
    webContents.openDevTools();
    [this.networkIdle0, this.networkIdle2] = Network.initMonitor(
      webContents,
      inflight,
    );

    webContents.on('context-menu', (_, props) => {
      const { x, y } = props;

      Menu.buildFromTemplate([
        {
          label: 'Inspect element',
          click: () => {
            webContents.inspectElement(x, y);
          },
        },
      ]).popup({ window: this.mainWindow });

      if (!webContents.debugger.isAttached()) {
        webContents.debugger.attach('1.3');
      }
    });

    webContents.loadURL(
      this.initUrl,
      // `file://${path.resolve(__dirname, '../../testHtml/scroll.html')}`,
    );

    webContents.debugger
      .sendCommand('DOM.enable')
      .then(() => webContents.debugger.sendCommand('Page.enable'))
      .catch((e) => {
        console.error('debugger error:', e);
      });
  }

  async runPrompt(
    requestId: number,
    prompt: string,
    args?: Record<string, string>,
    attachments?: PromptAttachment[],
    reasoningEffort?: LlmApi.ReasoningEffort,
    modelType?: LlmApi.LlmModelType,
  ): Promise<string | undefined> {
    console.info('====>');
    console.info(this.llmSession);
    console.info(`prompt:'${prompt}'`);
    if (this.llmSession) {
      try {
        const stream = this.llmSession.startPrompt(
          requestId,
          this,
          prompt,
          args,
          attachments,
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
  pushPromptResponse(requestId: number, chunk: string) {
    ToRendererIpc.promptResponse.send(this.mainWindow!.webContents, {
      requestId,
      chunk,
    });
  }
  static clipboardLock: Promise<void> = Promise.resolve();
  async pasteText(input: string) {
    await TabWebView.clipboardLock;
    TabWebView.clipboardLock = new Promise(async (resolve) => {
      clipboard.writeText(input);
      const wc = this.webView.webContents;
      wc.focus();
      if (isMac) {
        wc.sendInputEvent({
          type: 'keyDown',
          keyCode: 'Meta',
          modifiers: ['meta'],
        });
        await Util.sleep(50 + Math.random() * 50);
        wc.sendInputEvent({
          type: 'keyDown',
          keyCode: 'v',
          modifiers: ['meta'],
        });
        wc.paste();
        await Util.sleep(50 + Math.random() * 50);
        wc.sendInputEvent({
          type: 'keyUp',
          keyCode: 'Meta',
        });
      } else {
        wc.sendInputEvent({
          type: 'keyDown',
          keyCode: 'Control',
          modifiers: ['control'],
        });
        await Util.sleep(50 + Math.random() * 50);
        wc.sendInputEvent({
          type: 'keyDown',
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
    this.loadedFrame('MAIN');
    this.frameIds.add(frameId);
    if (scrollAdjustment) {
      settings.setSync('scrollAdjustment', scrollAdjustment);
      this.scrollAdjustment = scrollAdjustment;
    }
    if (!this.llmSession) {
      this.llmSession = new WebViewLlmSession(this.mainWindow);
      this.emitLlmSessionSnapshot(this.llmSession.getSnapshot());
    } else {
      // Keep the existing session so in-flight prompts don't lose their state.
      // this.llmSession.resumeAll();
    }
  }

  async setInputFile(
    inputSelector: string,
    filePaths: string[],
  ): Promise<string | undefined> {
    const wc = this.webView.webContents;
    const { root } = await wc.debugger.sendCommand('DOM.getDocument', {
      depth: -1,
    });

    console.log('root:', root, inputSelector);

    const input = await wc.debugger.sendCommand('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: inputSelector,
    });

    if (!input?.nodeId) return 'input not found';

    const desc = await wc.debugger.sendCommand('DOM.describeNode', {
      nodeId: input.nodeId,
    });

    await wc.debugger.sendCommand('DOM.setFileInputFiles', {
      backendNodeId: desc.node.backendNodeId,
      files: filePaths.map((f) => {
        const attachment = this.llmSession.readableFiles.get(f);
        if (!attachment) return f;
        if (attachment.path) return attachment.path;
        if (attachment.data) {
          const tempDir = app.getPath('temp');
          const safeName = attachment.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const tempPath = path.join(
            tempDir,
            `runever_upload_${Date.now()}_${safeName}`,
          );
          const content: string | NodeJS.ArrayBufferView =
            attachment.data instanceof ArrayBuffer
              ? Buffer.from(attachment.data)
              : attachment.data;
          fs.writeFileSync(tempPath, content);
          attachment.path = tempPath;
          return tempPath;
        }
        return f;
      }),
    });
  }

  iframeProgress(iframeId: string, type: IframeProgressType) {
    if (type === 'unload') {
      this.loadFrameStart(iframeId);
    } else if (type === 'loaded') {
      this.loadedFrame(iframeId);
    } else if (type === 'action') {
      // no-op for action progress
    }
  }

  loadFrameStart(iframeId: string) {
    this.loadingFrames.add(iframeId);
    this.pageLoadedLock.tryLock();
  }

  loadedFrame(iframeId: string) {
    if (iframeId === 'MAIN') {
      this.loadingFrames.clear();
    } else {
      this.loadingFrames.delete(iframeId);
    }
    if (this.loadingFrames.size === 0) {
      this.pageLoadedLock.delayUnlock(500);
    }
  }

  async download(url: string, filename?: string): Promise<string | undefined> {
    try {
      const item = await download(this.mainWindow, url, {
        filename,
      });
      if (item.getState() === 'completed') {
        if (filename !== undefined) {
          this.llmSession.readableFiles.set(filename, {
            name: filename,
            mimeType: item.getMimeType(),
            data: null,
            path: item.getSavePath(),
          });
        }
        return undefined;
      }
      return item.getState();
    } catch (error) {
      if (error instanceof CancelError) {
        console.info('item.cancel() was called');
        return 'cancelled';
      }
      console.error(error);
      return (error as Error).message;
    }
  }
}
