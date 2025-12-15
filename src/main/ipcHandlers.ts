import { BrowserWindow, ipcMain } from 'electron';
import settings from 'electron-settings';
import { initIpcMain } from '../contracts/ipc';
import { LlmConfig, ToMianIpc } from '../contracts/toMain';
import { ToRendererIpc } from '../contracts/toRenderer';
import '../contracts/toWebView'; // for initalise bridge handlers
import { TabWebView } from './webView/tab';

export const setupIpcHandlers = (mainWindow: BrowserWindow) => {
  const webViewTabsById = new Map<number, TabWebView>();

  const PADDING = 12;
  const DEFAULT_TABBAR_HEIGHT = 112;
  const DEFAULT_SIDEBAR_WIDTH = 430;
  const DEFAULT_DEVTOOLS_WIDTH = 360;

  type SafeBoundsOptions = {
    sidebarWidth?: number;
    tabbarHeight?: number;
    devtoolsWidth?: number;
  };

  const getSafeBounds = (opts: SafeBoundsOptions = {}) => {
    const sidebarWidth = opts.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH;
    const tabbarHeight = opts.tabbarHeight ?? DEFAULT_TABBAR_HEIGHT;
    const devtoolsWidth = opts.devtoolsWidth ?? 0;

    const win = mainWindow?.getBounds();
    const width = Math.max(
      320,
      (win?.width ?? 1024) - sidebarWidth - devtoolsWidth - PADDING * 2,
    );
    const height = Math.max(
      320,
      (win?.height ?? 728) - tabbarHeight - PADDING * 2,
    );
    return { x: PADDING, y: tabbarHeight + PADDING, width, height };
  };

  // const removeAllWebViews = () => {
  //   webViewTabsById.forEach((tab) => {
  //     mainWindow?.contentView.removeChildView(tab.webView);
  //   });
  //   webViewTabsById.clear();
  //   tabIdToFrameId.clear();
  // };

  console.log('starting main process ipc-example');
  ipcMain.handle('ocr-preload-loaded', async (event, arg) => {
    const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
    console.log('handle', msgTemplate(arg), event.frameId);
    return msgTemplate('ocr pong');
  });

  ipcMain.handle('ipc-example', async (event, arg) => {
    const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
    console.log(msgTemplate(arg));
    return msgTemplate('pong');
  });

  initIpcMain(ipcMain, webViewTabsById);

  ToMianIpc.bindFrameId.handle(async (event, arg) => {
    const wvTab = webViewTabsById.get(arg.id);
    console.log('bindFrameId in main process:', event.frameId, arg);
    if (wvTab) {
      wvTab.frameIds.add(event.frameId);
    }
    return { error: 'Tab not found' };
  });

  ToMianIpc.takeScreenshot.handle(async (event, arg) => {
    const { slices, ttlWidth, vpWidth, ttlHeight, vpHeight, frameId } = arg;
    console.log('takeScreenshot in main process:', frameId);
    const wvTab = webViewTabsById.get(frameId);
    if (wvTab) {
      const imgs = [];
      for (const slice of slices) {
        await wvTab.webView.webContents.executeJavaScript(
          `window.scrollTo(${slice.x}, ${slice.y});`,
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        const width =
          vpWidth + slice.x > ttlWidth ? ttlWidth - slice.x : vpWidth;
        const height =
          vpHeight + slice.y > ttlHeight ? ttlHeight - slice.y : vpHeight;
        imgs.push(
          await wvTab.webView.webContents.capturePage({
            x: vpWidth - width,
            y: vpHeight - height,
            width,
            height,
          }),
        );
      }

      return imgs.map((img) => img.toPNG());
    }
    console.log('takeScreenshot error:', frameId, webViewTabsById);
    return { error: 'Tab not found' };
  });

  ToMianIpc.createTab.handle(async (event, detail) => {
    console.log(
      'Create tab request received in main process:',
      detail,
      event.frameId,
    );
    const bounds = detail.bounds ?? getSafeBounds();
    const wvTab = new TabWebView(detail.url, bounds);
    const frameId = wvTab.webView.webContents.id;
    webViewTabsById.set(frameId, wvTab);
    mainWindow?.contentView.addChildView(wvTab.webView);
    return { id: frameId };
  });

  ToMianIpc.operateTab.handle(async (event, detail) => {
    console.log(
      'Operate tab request received in main process:',
      detail,
      event.frameId,
    );
    const frameId = detail.id;
    const wvTab = frameId ? webViewTabsById.get(frameId) : undefined;
    if (wvTab) {
      let response;
      if (detail.close) {
        wvTab.webView.setVisible(false);
        mainWindow?.contentView.removeChildView(wvTab.webView);
        webViewTabsById.delete(frameId!);
        response = 'closed';
      } else {
        if (detail.visible !== undefined) {
          wvTab.webView.setVisible(detail.visible);
        }
        if (detail.bounds) {
          wvTab.webView.setBounds(detail.bounds);
        } else if (!detail.url && !detail.exeScript) {
          const devtoolsWidth = wvTab.webView.webContents.isDevToolsOpened()
            ? DEFAULT_DEVTOOLS_WIDTH
            : 0;
          wvTab.webView.setBounds(
            getSafeBounds({
              sidebarWidth: detail.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH,
              tabbarHeight: detail.tabbarHeight ?? DEFAULT_TABBAR_HEIGHT,
              devtoolsWidth,
            }),
          );
        }
        if (detail.url) {
          wvTab.webView.webContents.loadURL(detail.url);
          await new Promise((resolve) => {
            setTimeout(resolve, 1000);
          });
        }
        if (detail.exeScript) {
          response = await wvTab.webView.webContents.executeJavaScript(
            detail.exeScript,
          );
        }
      }
      return { response };
    }
    return { error: 'Tab not found' };
  });

  ToMianIpc.getLlmConfig.handle(async (event, frameId) => {
    const loadedConfig = settings.getSync('llmConfig');
    if (loadedConfig) {
      return loadedConfig as LlmConfig;
    }
    // const configFromUser = await askUserInput('LLM config', {
    //   'LLM provider': { type: 'select', options: ['OpenAI'] },
    //   'LLM api key': { type: 'string' },
    // });
    // const llmConfig: LlmConfig = {
    //   api: configFromUser['LLM provider'].toLowerCase() as 'openai',
    //   key: configFromUser['LLM api key'],
    // };

    const llmConfig: LlmConfig = {
      api: process.env.LLM_API_PROVIDER as 'openai',
      key: process.env.LLM_API_KEY as string,
    };

    settings.setSync('llmConfig', llmConfig);
    return llmConfig;
  });

  const userInputHandlers: Record<
    number,
    (v: Record<string, string> | PromiseLike<Record<string, string>>) => void
  > = {};

  ToMianIpc.responsePromptInput.handle(async (event, arg) => {
    const handler = userInputHandlers[arg.id];
    if (handler) {
      handler(arg.answer);
      delete userInputHandlers[arg.id];
    }
  });

  async function askUserInput<
    Q extends Record<
      string,
      | {
          type: 'string';
        }
      | {
          type: 'select';
          options: string[];
        }
    >,
  >(
    message: string,
    questions: Q,
  ): Promise<Record<Extract<keyof Q, string>, string>> {
    const responseId = Date.now() * 100 + Math.floor(Math.random() * 100);

    const promise = new Promise<Record<Extract<keyof Q, string>, string>>(
      (resolve) => {
        userInputHandlers[responseId] = resolve;
      },
    );

    ToRendererIpc.ToUser.send(mainWindow.webContents, {
      type: 'prompt',
      message,
      questions,
      responseId,
    });

    return promise;
  }
};
