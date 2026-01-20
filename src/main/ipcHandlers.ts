import { exec } from 'child_process';
import { BrowserWindow, ipcMain, MouseInputEvent } from 'electron';
import settings from 'electron-settings';
import type { WebViewLlmSession } from '../agentic/webviewLlmSession';
import { initIpcMain } from '../contracts/ipc';
import { ToMainIpc } from '../contracts/toMain';
import { ToRendererIpc } from '../contracts/toRenderer';
import '../contracts/toWebView'; // for initalise bridge handlers
import { Util } from '../webView/util';
import {
  openBrowserWindowDialog,
  openPromptInputDialog,
  showSystemMessageBox,
} from './dialogs';
import { LlmApi } from './llm/api';
import { apiTrustEnvVars } from '../schema/env.node';
import {
  clearPendingAuthDeepLink,
  consumePendingAuthDeepLink,
  setPendingAuthDeepLink,
} from './authDeepLink';
import { ApiTrustTokenStore } from './apiTrustTokenStore';

function initPromptIpc(session: WebViewLlmSession) {
  const getTab = (frameId: number) => session.getTab(frameId);
  ToMainIpc.actionDone.handle(async (event, arg) => {
    console.log('Pop actions:', arg);
    const { frameId, actionId, argsDelta } = arg;
    const wvTab = getTab(frameId);
    if (wvTab) {
      wvTab.actionDone(actionId, argsDelta);
      return true;
    }
    return false;
  });
  ToMainIpc.actionError.handle(async (event, arg) => {
    console.log('Err actions:', arg);
    const { frameId, actionId, error } = arg;
    const wvTab = getTab(frameId);
    if (wvTab) {
      wvTab.actionError(error, actionId);
      return true;
    }
    return false;
  });
  ToMainIpc.iframeProgress.handle(async (event, arg) => {
    const { frameId, type, iframeId } = arg;
    const wvTab = getTab(frameId);
    if (wvTab) {
      wvTab.iframeProgress(iframeId, type);
      return {};
    }
    return { error: 'Tab not found' };
  });
  ToMainIpc.runPrompt.handle(async (event, arg) => {
    console.info('Run prompt:', arg);
    const {
      frameId,
      prompt,
      modelType,
      reasoningEffort,
      args,
      requestId,
      attachments,
    } = arg;
    console.info('runPrompt in main process:', arg);
    const error = await session.runPrompt(
      requestId,
      prompt,
      args,
      attachments,
      reasoningEffort,
      modelType,
      frameId,
    );
    return { error };
  });

  ToMainIpc.stopPrompt.handle(async (_event, arg) => {
    const { frameId, requestId } = arg;
    const wvTab = getTab(frameId);
    if (!wvTab) return { stopped: false, error: 'Tab not found' };
    wvTab.stopPrompt(requestId);
    return { stopped: true };
  });

  ToMainIpc.getLlmSessionSnapshot.handle(async (_event, arg) => {
    const wvTab = getTab(arg.frameId);
    if (!wvTab) return { error: 'Tab not found' };
    const snapshot = wvTab.llmSession?.getSnapshot() ?? null;
    return { snapshot };
  });

  ToMainIpc.getTabNavigationState.handle(async (_event, arg) => {
    const wvTab = getTab(arg.frameId);
    if (!wvTab) return { error: 'Tab not found' };
    const wc = wvTab.webView.webContents;
    // Use navigationHistory API to check navigation state
    const navHistory = wc.navigationHistory;
    return {
      canGoBack: navHistory.canGoBack(),
      canGoForward: navHistory.canGoForward(),
      url: wc.getURL(),
    };
  });

  ToMainIpc.navigateTabHistory.handle(async (_event, arg) => {
    const wvTab = getTab(arg.frameId);
    if (!wvTab) return { error: 'Tab not found' };
    const wc = wvTab.webView.webContents;
    const navHistory = wc.navigationHistory;
    if (arg.direction === 'back') {
      if (navHistory.canGoBack()) navHistory.goBack();
    } else if (navHistory.canGoForward()) {
      navHistory.goForward();
    }
    return {
      canGoBack: navHistory.canGoBack(),
      canGoForward: navHistory.canGoForward(),
      url: wc.getURL(),
    };
  });
}

export const setupIpcHandlers = (
  mainWindow: BrowserWindow,
  llmSession: WebViewLlmSession,
) => {
  const apiTrustTokenStore = new ApiTrustTokenStore();
  const getTab = (frameId?: number) =>
    typeof frameId === 'number' ? llmSession.getTab(frameId) : undefined;

  // const removeAllWebViews = () => {
  //   webViewTabsById.forEach((tab) => {
  //     mainWindow?.contentView.removeChildView(tab.webView);
  //   });
  //   webViewTabsById.clear();
  //   tabIdToFrameId.clear();
  // };

  console.log('starting main process ipc-example');
  initIpcMain(ipcMain, llmSession);

  ToMainIpc.bindFrameId.handle(async (event, arg) => {
    const wvTab = getTab(arg.id);
    console.log('bindFrameId in main process:', event.frameId, arg);
    if (wvTab) {
      wvTab.pageLoaded(event.frameId, arg.scrollAdjustment);
      wvTab.webView.webContents.executeJavaScript(
        'window.electronDummyCursor = document.getElementById("runEver-dummy-cursor");',
      );
    }
    return { error: 'Tab not found' };
  });

  ToMainIpc.takeScreenshot.handle(async (event, arg) => {
    const { slices, ttlWidth, vpWidth, ttlHeight, vpHeight, frameId } = arg;
    console.log('takeScreenshot in main process:', frameId);
    const wvTab = getTab(frameId);
    if (wvTab) {
      const imgs = [];
      for (const slice of slices) {
        await wvTab.webView.webContents.executeJavaScript(
          `window.scrollTo(${slice.x}, ${slice.y});`,
        );
        await Util.sleep(100);
        const width =
          vpWidth + slice.x > ttlWidth ? ttlWidth - slice.x : vpWidth;
        const height =
          vpHeight + slice.y > ttlHeight ? ttlHeight - slice.y : vpHeight;
        imgs.push(
          await wvTab.screenshot(
            vpWidth - width,
            vpHeight - height,
            width,
            height,
          ),
        );
      }

      return imgs.map((img) => img.toPNG());
    }
    console.log('takeScreenshot error:', frameId, llmSession.getTabsById());
    return { error: 'Tab not found' };
  });

  ToMainIpc.showSystemMessageBox.handle(async (_event, opts) => {
    return showSystemMessageBox(mainWindow, opts);
  });

  ToMainIpc.openBrowserWindowDialog.handle(async (_event, opts) => {
    return openBrowserWindowDialog(mainWindow, opts);
  });

  ToMainIpc.openPromptInputDialog.handle(async (_event, opts) => {
    return openPromptInputDialog(mainWindow, opts);
  });

  ToMainIpc.createTab.handle(async (event, detail) => {
    console.log(
      'Create tab request received in main process:',
      detail,
      event.frameId,
    );
    return llmSession.createTab(detail);
  });

  ToMainIpc.operateTab.handle(async (event, detail) => {
    return llmSession.operateTab(detail);
  });

  ToMainIpc.getLlmConfig.handle(async (event, frameId) => {
    const loadedConfig = settings.getSync('llmConfig');
    try {
      return LlmApi.llmConfigSchema.parse(loadedConfig) as LlmApi.LlmConfig;
    } catch (error) {
      console.error('Llm config error:', error);
      const llmConfig: LlmApi.LlmConfig = {
        api: process.env.LLM_API_PROVIDER as 'openai',
        key: process.env.LLM_API_KEY as string,
      };
      settings.setSync('llmConfig', llmConfig);
      return llmConfig;
    }
  });

  ToMainIpc.getApiTrustEnv.handle(async () => {
    return apiTrustEnvVars;
  });

  ToMainIpc.getApiTrustToken.handle(async () => {
    try {
      const token = await apiTrustTokenStore.getToken();
      return { token };
    } catch (error) {
      console.error('Failed to read ApiTrust token', error);
      return { token: null };
    }
  });

  ToMainIpc.getPendingAuthDeepLink.handle(async () => {
    return { url: consumePendingAuthDeepLink() };
  });

  ToMainIpc.clearPendingAuthDeepLink.handle(async () => {
    clearPendingAuthDeepLink();
  });

  ToMainIpc.setApiTrustToken.handle(async (_event, payload) => {
    try {
      await apiTrustTokenStore.setToken(payload.token ?? null);
    } catch (error) {
      console.error('Failed to store ApiTrust token', error);
    }
  });

  let apiTrustAuthWindow: BrowserWindow | null = null;
  const apiTrustAuthPartition = 'persist:apitrust-auth';

  const closeApiTrustAuthWindow = () => {
    if (apiTrustAuthWindow && !apiTrustAuthWindow.isDestroyed()) {
      apiTrustAuthWindow.close();
    }
    apiTrustAuthWindow = null;
  };

  const handleApiTrustCallback = (url: string) => {
    setPendingAuthDeepLink(url);
    if (!mainWindow.isDestroyed()) {
      ToRendererIpc.authDeepLink.send(mainWindow.webContents, { url });
      mainWindow.show();
      mainWindow.focus();
    }
    closeApiTrustAuthWindow();
  };

  const attachApiTrustHandlers = (authWindow: BrowserWindow) => {
    const intercept = (event: { preventDefault: () => void }, targetUrl: string) => {
      if (!targetUrl.startsWith('runever://')) {
        return;
      }
      console.log('intercept ===========>', targetUrl);
      event.preventDefault();
      handleApiTrustCallback(targetUrl);
    };

    authWindow.webContents.on('will-navigate', intercept);
    authWindow.webContents.on('will-redirect', intercept);
    authWindow.webContents.setWindowOpenHandler(({ url }) => {
      console.log('setWindowOpenHandler ===========>', url);
      if (url.startsWith('runever://')) {
        handleApiTrustCallback(url);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });
  };

  ToMainIpc.openApiTrustAuthWindow.handle(async (_event, { url }) => {
    if (apiTrustAuthWindow && !apiTrustAuthWindow.isDestroyed()) {
      await apiTrustAuthWindow.loadURL(url);
      apiTrustAuthWindow.show();
      apiTrustAuthWindow.focus();
      return;
    }

    apiTrustAuthWindow = new BrowserWindow({
      parent: mainWindow,
      width: 520,
      height: 720,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: apiTrustAuthPartition,
      },
    });

    apiTrustAuthWindow.on('closed', () => {
      apiTrustAuthWindow = null;
    });

    const mainUserAgent = mainWindow.webContents.getUserAgent();
    const authUserAgent = mainUserAgent.replace(/\s?Electron\/\S+/, '');
    apiTrustAuthWindow.webContents.setUserAgent(authUserAgent);

    attachApiTrustHandlers(apiTrustAuthWindow);

    apiTrustAuthWindow.once('ready-to-show', () => {
      apiTrustAuthWindow?.show();
    });

    await apiTrustAuthWindow.loadURL(url);
  });

  ToMainIpc.responsePromptInput.handle(async (_event, arg) => {
    llmSession.resolveUserInput(arg.id, arg.answer);
  });

  ToMainIpc.dispatchEvents.handle(async (event, arg) => {
    const { frameId, events } = arg;
    const wvTab = getTab(frameId);
    if (wvTab) {
      const wc = wvTab.webView.webContents;
      wc.focus();
      let mv: MouseInputEvent | undefined;
      console.log('Dispatch events in main process:', arg);
      for (const ev of events) {
        if (ev.delayMs) {
          await Util.sleep(ev.delayMs);
        }
        wc.sendInputEvent(ev);
        if (ev.type === 'mouseMove') {
          await wc.executeJavaScript(
            `window.electronDummyCursor.style.left = ${ev.x} + 'px';
window.electronDummyCursor.style.top = ${ev.y} + 'px';`,
          );
          mv = ev as MouseInputEvent;
        }
      }
      if (mv) {
        wvTab.mouseX = mv.x;
        wvTab.mouseY = mv.y;
      }
      return true;
    }
    console.warn('Failed Dispatch events in main process:', arg);
    return false;
  });

  ToMainIpc.dispatchNativeKeypress.handle(async (ev, arg) => {
    const { keyAndDelays } = arg;
    switch (process.platform) {
      case 'darwin':
        const keyToCode: Record<ToMainIpc.NativeKeys, number> = {
          ArrowDown: 125,
          ArrowUp: 126,
          Enter: 36,
          ArrowLeft: 123,
          ArrowRight: 124,
          Tab: 48,
          Space: 49,
          Escape: 53,
        };
        let keyCode: number | undefined;
        const osCodes: string[] = [];
        for (const keyAndDelay of keyAndDelays) {
          keyCode = keyToCode[keyAndDelay[0]];
          if (keyCode) {
            osCodes.push(`  key code ${keyCode}
  delay ${keyAndDelay[1] / 1000}`);
          }
        }
        await new Promise<void>((resolve) => {
          exec(
            `
osascript <<'EOF'
tell application "System Events"
${osCodes.join('\n')}
end tell
EOF
`,
            (error, stdout, stderr) => {
              if (error) console.error(error);
              if (stderr) console.error(stderr);
              resolve();
            },
          );
        });

        return true;
      default:
      // not supported
    }
    return false;
  });

  ToMainIpc.pasteInput.handle(async (event, arg) => {
    console.log('Paste input:', arg);
    const { frameId, input } = arg;
    const wvTab = getTab(frameId);
    if (wvTab) {
      await wvTab.pasteText(input);
      return true;
    }
    return false;
  });
  ToMainIpc.setInputFile.handle(async (event, arg) => {
    console.log('setInputFile:', arg);
    const { frameId, selector, filePaths } = arg;
    const wvTab = getTab(frameId);
    if (wvTab) {
      return { error: await wvTab.setInputFile(selector, filePaths) };
    }
    return { error: 'Tab not found' };
  });
  initPromptIpc(llmSession);

  // User input requests are dispatched by WebViewLlmSession.askUserInput().
};
