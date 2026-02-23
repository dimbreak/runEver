import {
  app,
  clipboard,
  Menu,
  Rectangle,
  WebContentsView,
  nativeImage,
} from 'electron';
import settings from 'electron-settings';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import { CancelError, download } from '../download';
import { WireActionWithWaitAndRec } from '../../agentic/types';
import { Session } from '../../agentic/session';
import { IframeProgressType } from '../../extensions/iframe/types';
import { Network } from '../../webView/network';
import { Util } from '../../webView/util';
import { showSystemMessageBox } from '../dialogs';
import { isMac } from '../util';
import { RunEverWindow } from '../window';

export class TabWebView {
  url: string;

  webView: WebContentsView;

  frameIds = new Set<number>();

  mouseX: number = -1;
  mouseY: number = -1;

  scrollAdjustment: number;

  session: Session;

  pageLoadedLock = Util.newLock();

  networkIdle0: Util.Lock | undefined;
  networkIdle2: Util.Lock | undefined;

  loadingFrames = new Set<string>();

  constructor(
    public initUrl: string,
    public bounds: Rectangle,
    private mainWindow: RunEverWindow,
    llmSession: Session,
  ) {
    this.url = this.initUrl;
    this.session = llmSession;
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
    return this.session.isFocused(this);
  }

  focus() {
    this.webView.webContents.focus();
    this.session.focusTab(this);
  }

  blur() {
    // no-op
  }

  stopPrompt() {
    this.session.stopPrompt();
    this.pageLoadedLock.unlock();
  }

  async operate(detail: {
    bounds?: Rectangle;
    url?: string;
    viewportWidth?: number;
    exeScript?: string;
    visible?: boolean;
    sidebarWidth?: number;
    tabbarHeight?: number;
  }) {
    let response;
    if (detail.visible !== undefined) {
      this.webView.setVisible(detail.visible);
      if (detail.visible) {
        this.focus();
      }
    }
    console.log('operate bounds:', detail.bounds);
    if (detail.bounds) {
      console.log('operate bounds:', detail.bounds);
      this.webView.setBounds(detail.bounds);
      this.bounds = detail.bounds;
    } else if (!detail.url && !detail.exeScript) {
      this.webView.setBounds(
        this.session.getSafeBounds({
          sidebarWidth: detail.sidebarWidth ?? Session.DEFAULT_SIDEBAR_WIDTH,
          tabbarHeight: detail.tabbarHeight ?? Session.DEFAULT_TABBAR_HEIGHT,
          viewportWidth: detail.viewportWidth,
        }),
      );
    }
    if (detail.url) {
      this.webView.webContents.loadURL(detail.url);
      await Util.sleep(1000);
    }
    if (detail.exeScript) {
      response = await this.webView.webContents.executeJavaScript(
        detail.exeScript,
      );
    }
    return response;
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

  async screenshot(
    x = 0,
    y = 0,
    capWidth = 0,
    capHeight = 0,
    filename: string | undefined = undefined,
  ) {
    let width = capWidth;
    let height = capHeight;
    const rect = this.webView.getBounds();
    if (width === 0 && height === 0) {
      width = rect.width;
      height = rect.height;
    }
    let shot: Promise<Electron.NativeImage>;
    if (width > rect.width || height > rect.height) {
      shot = (async () => {
        try {
          const { scrollX, scrollY } =
            await this.webView.webContents.executeJavaScript(
              '({scrollX: window.scrollX, scrollY: window.scrollY})',
            );

          const chunks: {
            buffer: Buffer;
            x: number;
            y: number;
            w: number;
            h: number;
          }[] = [];
          let scaleFactor = 1;

          const docX = scrollX + x;
          const docY = scrollY + y;
          const vpW = rect.width;
          const vpH = rect.height;

          for (let py = 0; py < height; py += vpH) {
            for (let px = 0; px < width; px += vpW) {
              const scrollToX = docX + px;
              const scrollToY = docY + py;

              await this.webView.webContents.executeJavaScript(
                `window.scrollTo(${scrollToX}, ${scrollToY})`,
              );
              await Util.sleep(150);

              const { x: sx, y: sy } =
                await this.webView.webContents.executeJavaScript(
                  '({x: window.scrollX, y: window.scrollY})',
                );

              const interLeft = Math.max(docX, sx);
              const interTop = Math.max(docY, sy);
              const interRight = Math.min(docX + width, sx + vpW);
              const interBottom = Math.min(docY + height, sy + vpH);

              if (interRight > interLeft && interBottom > interTop) {
                const capX = interLeft - sx;
                const capY = interTop - sy;
                const capW = interRight - interLeft;
                const capH = interBottom - interTop;

                const image = await this.webView.webContents.capturePage({
                  x: capX,
                  y: capY,
                  width: capW,
                  height: capH,
                });
                const buffer = image.toBitmap();

                if (chunks.length === 0) {
                  const size = image.getSize();
                  if (size.width > 0 && size.height > 0) {
                    scaleFactor = Math.sqrt(
                      buffer.length / (size.width * size.height * 4),
                    );
                  }
                }
                chunks.push({
                  buffer,
                  x: interLeft - docX,
                  y: interTop - docY,
                  w: capW,
                  h: capH,
                });
              }
            }
          }

          await this.webView.webContents.executeJavaScript(
            `window.scrollTo(${scrollX}, ${scrollY})`,
          );

          const finalW = Math.ceil(width * scaleFactor);
          const finalH = Math.ceil(height * scaleFactor);
          const totalBuffer = Buffer.alloc(finalW * finalH * 4);

          for (const chunk of chunks) {
            const cw = Math.round(chunk.w * scaleFactor);
            const ch = Math.round(chunk.h * scaleFactor);
            const dx = Math.round(chunk.x * scaleFactor);
            const dy = Math.round(chunk.y * scaleFactor);
            const chunkBuffer = chunk.buffer;

            for (let r = 0; r < ch; r++) {
              const srcStart = r * cw * 4;
              const targetRow = dy + r;
              if (targetRow >= finalH) continue;
              const dstStart = (targetRow * finalW + dx) * 4;
              if (
                srcStart + cw * 4 <= chunkBuffer.length &&
                dstStart + cw * 4 <= totalBuffer.length
              ) {
                chunkBuffer.copy(
                  totalBuffer,
                  dstStart,
                  srcStart,
                  srcStart + cw * 4,
                );
              }
            }
          }

          return nativeImage.createFromBitmap(totalBuffer, {
            width,
            height,
            scaleFactor,
          });
        } catch (e) {
          console.error('Scroll screenshot failed, falling back', e);
          return this.webView.webContents.capturePage({
            x,
            y,
            width,
            height,
          });
        }
      })();
    } else {
      console.log('screenshot', width, height, x, y);
      shot = this.webView.webContents.capturePage({
        x,
        y,
        width,
        height,
      });
    }
    if (filename) {
      const data = await shot;
      const imgPath = `${app.getPath('downloads')}/${filename.includes('.') ? filename : `${filename}.png`}`;
      fs.writeFileSync(imgPath, (await shot).toPNG());
      this.session.readableFiles.set(filename, {
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

    webContents.on('render-process-gone', (_e, details) => {
      console.error('[WCV] render-process-gone', details); // reason / exitCode
    });

    webContents.on('destroyed', () => {
      console.error('[WCV] webContents destroyed');
    });

    webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error('[WCV] did-fail-load', { code, desc, url });
    });

    webContents.on('unresponsive', () => console.error('[WCV] unresponsive'));
    webContents.on('responsive', () => console.log('[WCV] responsive'));

    // webContents.on('console-message', (_e, level, message, line, sourceId) => {
    //   if (level > 1) {
    //     console.log('[WCV console]', { level, message, line, sourceId });
    //   }
    // });

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
        this.url = details.url;
        if (!details.isSameDocument) {
          console.log('did-start-navigation:', details.url);
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
            `window.postMessage({ scrollAdjustment: ${this.scrollAdjustment}, frameId: ${frameId}, sessionId: ${this.session.id}, mouseX: ${this.mouseX}, mouseY: ${this.mouseY}})`,
          );
          this.session.resumeAll();
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
      this.url = currentUrl;
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

    const filesToUpload: string[] = [];

    for (const f of filePaths) {
      const attachment = this.session.readableFiles.get(f);
      if (attachment) {
        if (attachment.path) {
          filesToUpload.push(attachment.path);
        }
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
          filesToUpload.push(tempPath);
        }
      } else {
        return `input not found:${f}`;
      }
    }

    await wc.debugger.sendCommand('DOM.setFileInputFiles', {
      backendNodeId: desc.node.backendNodeId,
      files: filesToUpload,
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
        this.session.downloaded(item, filename);
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

  pushSecret(secretStr: string) {
    console.log('pushSecret:', secretStr);
    this.webView.webContents.executeJavaScript(
      `window.webView.setSecret(${secretStr})`,
    );
  }
}
