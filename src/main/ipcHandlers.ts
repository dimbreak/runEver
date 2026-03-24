import { exec } from 'child_process';
import { BrowserWindow, ipcMain } from 'electron';
import type { Session } from '../agentic/session';
import { initIpcMain } from '../contracts/ipc';
import { ToMainIpc } from '../contracts/toMain';
import { ToRendererIpc } from '../contracts/toRenderer';
import '../contracts/toWebView'; // for initalise bridge handlers
import { ToRuneverIpc } from '../contracts/toRunever';
import { Util } from '../webView/util';
import {
  openBrowserWindowDialog,
  openPromptInputDialog,
  showSystemMessageBox,
} from './dialogs';
import { apiTrustEnvVars } from '../schema/env.node';
import {
  clearPendingAuthDeepLink,
  consumePendingAuthDeepLink,
  setPendingAuthDeepLink,
} from './authDeepLink';
import { ApiTrustTokenStore } from './apiTrustTokenStore';
import { ProfileStore } from './profileStore';
import { RuneverConfigStore } from './runeverConfigStore';
import type { RunEverConfig } from '../schema/runeverConfig';
import { RunEverWindow } from './window';

const getSession = (sessionId?: number): Session =>
  RunEverWindow.getAgenticSession(sessionId)!;

function initPromptIpc() {
  const getTab = (
    sessionId: number | undefined,
    frameId: number | undefined,
  ) => {
    const session = getSession(sessionId);
    return frameId === undefined
      ? session.getFocusedTab()
      : session.getTab(frameId);
  };
  ToMainIpc.actionDone.handle(async (event, arg) => {
    console.log('Pop actions:', arg);
    const { sessionId, actionId, argsDelta } = arg;
    getSession(sessionId).actionDone(actionId, argsDelta);
    return true;
  });
  ToMainIpc.actionError.handle(async (event, arg) => {
    console.log('Err actions:', arg);
    const { sessionId, actionId, error } = arg;
    getSession(sessionId).actionError(actionId, error);
    return true;
  });
  ToMainIpc.iframeProgress.handle(async (event, arg) => {
    const { sessionId, frameId, type, iframeId } = arg;
    const wvTab = getTab(sessionId, frameId);
    if (wvTab) {
      wvTab.iframeProgress(iframeId, type);
      return {};
    }
    return { error: 'Tab not found' };
  });
  ToMainIpc.runPrompt.handle(async (event, arg) => {
    console.info('Run prompt:', arg);
    const {
      sessionId,
      prompt,
      modelType,
      reasoningEffort,
      args,
      requestId,
      attachments,
    } = arg;
    console.info('runPrompt in main process:', arg);
    const session = getSession(sessionId);
    const error = await session.runPrompt(
      requestId,
      prompt,
      args,
      attachments,
      reasoningEffort,
      modelType,
    );
    return { error };
  });

  ToMainIpc.stopPrompt.handle(async (_event, arg) => {
    const { sessionId } = arg;
    getSession(sessionId).stopPrompt();
    return { stopped: true };
  });

  ToMainIpc.getTabNavigationState.handle(async (_event, arg) => {
    const wvTab = getTab(arg.sessionId, arg.frameId);
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
    const wvTab = getTab(arg.sessionId, arg.frameId);
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

export const setupIpcHandlers = (mainWindow: RunEverWindow) => {
  const apiTrustTokenStore = new ApiTrustTokenStore();
  const userApiKeyStore = RuneverConfigStore.getInstance();
  const getTab = (sessionId?: number, frameId?: number) => {
    const session = getSession(sessionId);
    return typeof frameId === 'number' ? session.getTab(frameId) : undefined;
  };

  // const removeAllWebViews = () => {
  //   webViewTabsById.forEach((tab) => {
  //     mainWindow?.contentView.removeChildView(tab.webView);
  //   });
  //   webViewTabsById.clear();
  //   tabIdToFrameId.clear();
  // };

  console.log('starting main process ipc-example');
  initIpcMain(ipcMain);

  ToMainIpc.bindFrameId.handle(async (event, arg) => {
    const wvTab = getTab(arg.sessionId, arg.frameId);
    console.log('bindFrameId in main process:', event.frameId, arg);
    if (wvTab) {
      wvTab.pageLoaded(event.frameId, arg.scrollAdjustment);
    }
    return { error: 'Tab not found' };
  });

  ToMainIpc.takeScreenshot.handle(async (event, arg) => {
    const {
      sessionId,
      x = 0,
      y = 0,
      width,
      vpWidth,
      height,
      vpHeight,
      frameId,
      filename,
    } = arg;
    console.log('takeScreenshot in main process:', frameId);
    const wvTab = getTab(sessionId, frameId);
    if (wvTab) {
      const w = vpWidth + x > width ? width - x : vpWidth;
      const h = vpHeight + y > height ? height - y : vpHeight;

      return (
        await wvTab.screenshot(
          vpWidth - w,
          vpHeight - h,
          width,
          height,
          filename,
        )
      ).toPNG();
    }
    console.log('takeScreenshot error:', frameId);
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
    return getSession(detail.sessionId).createTab(detail);
  });

  ToMainIpc.operateTab.handle(async (event, detail) => {
    return getSession(detail.sessionId)?.operateTab(detail);
  });

  ToMainIpc.onResize.handle(async (_event, detail) => {
    return getSession(detail.sessionId)?.onWindowResize(detail);
  });

  ToMainIpc.updateUrlSuggestionsOverlay.handle(async (_event, detail) => {
    await getSession(detail.sessionId)?.showUrlSuggestionsOverlay(
      detail.suggestions,
      detail.selectedIndex ?? -1,
    );
  });

  ToMainIpc.getUrlSuggestions.handle(async (_event, detail) => {
    return ProfileStore.getInstance().getUrlSuggestions(
      detail.query ?? '',
      detail.limit ?? 10,
    );
  });

  ToMainIpc.recordUrlVisit.handle(async (_event, detail) => {
    await ProfileStore.getInstance().recordUrlVisit(detail.url);
  });

  ToMainIpc.hideUrlSuggestionsOverlay.handle(async (_event, detail) => {
    await getSession(detail.sessionId)?.hideUrlSuggestionsOverlay();
  });

  ToMainIpc.getUserAuthState.handle(async () => {
    try {
      const config = await userApiKeyStore.getConfig('apiKey');
      return {
        hasApiKey:
          Boolean(config?.apiKey) ||
          Boolean(config?.provider === 'codex' && config?.authMode === 'login'),
        provider: config?.provider ?? null,
        authMode: config?.authMode,
      };
    } catch (error) {
      console.error('Failed to read user API key config', error);
      return {
        hasApiKey: false,
        provider: null,
        authMode: null,
      };
    }
  });

  ToMainIpc.setUserApiKey.handle(async (_event, payload) => {
    try {
      await userApiKeyStore.setConfig('apiKey', {
        provider: payload.provider,
        apiKey: payload.apiKey,
        baseUrl: payload.baseUrl,
        authMode: payload.authMode,
      });
    } catch (error) {
      console.error('Failed to store user API key', error);
    }
  });

  ToMainIpc.clearUserApiKey.handle(async () => {
    try {
      await userApiKeyStore.setConfig('apiKey', undefined);
    } catch (error) {
      console.error('Failed to clear user API key', error);
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
    const intercept = (
      event: { preventDefault: () => void },
      targetUrl: string,
    ) => {
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
    getSession(arg.sessionId).resolveUserInput(arg.id, arg.answer);
  });

  ToMainIpc.dispatchEvents.handle(async (event, arg) => {
    const { sessionId, frameId, events } = arg;
    const wvTab = getTab(sessionId, frameId);
    if (wvTab) {
      const session = getSession(sessionId);
      const wc = wvTab.webView.webContents;
      const isMouseBatch =
        events.length > 0 &&
        typeof events[0].type === 'string' &&
        events[0].type.startsWith('mouse');
      wc.focus();
      let lastPoint: { x: number; y: number } | undefined;
      console.log('Dispatch events in main process:', arg.events);
      try {
        if (isMouseBatch && wvTab.isFocused) {
          session?.showInputOverlay(wvTab.bounds);
          if (wvTab.mouseX >= 0 && wvTab.mouseY >= 0) {
            await session?.updateOverlayCursor(wvTab.mouseX, wvTab.mouseY);
          }
        }

        for (const ev of events) {
          if (ev.delayMs) {
            await Util.sleep(ev.delayMs);
          }
          wc.sendInputEvent(ev);
          if (wvTab.isFocused && 'x' in ev && 'y' in ev) {
            lastPoint = { x: ev.x, y: ev.y };
            try {
              await session?.updateOverlayCursor(ev.x, ev.y);
            } catch (error) {
              console.warn('Failed to sync overlay cursor:', error);
            }
          }
        }
      } finally {
        if (isMouseBatch) {
          session?.hideInputOverlay();
        }
      }
      if (lastPoint) {
        wvTab.mouseX = lastPoint.x;
        wvTab.mouseY = lastPoint.y;
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
    const { sessionId, frameId, input } = arg;
    const wvTab = getTab(sessionId, frameId);
    if (wvTab) {
      await wvTab.pasteText(input);
      return true;
    }
    return false;
  });
  ToMainIpc.setInputFile.handle(async (event, arg) => {
    console.log('setInputFile:', arg);
    const { sessionId, frameId, selector, filePaths } = arg;
    const wvTab = getTab(sessionId, frameId);
    if (wvTab) {
      return { error: await wvTab.setInputFile(selector, filePaths) };
    }
    return { error: 'Tab not found' };
  });
  ToMainIpc.download.handle(async (event, arg) => {
    console.log('download:', arg);
    const { sessionId, frameId, filename, url } = arg;
    const wvTab = getTab(sessionId, frameId);
    if (wvTab) {
      return { error: await wvTab.download(url, filename) };
    }
    return { error: 'Tab not found' };
  });

  ToRuneverIpc.setConfig.handle(async (_event, arg) => {
    const { frameId, key, config } = arg;
    console.log('setConfig in renderer process:', arg);
    const wvTab = getTab(undefined, frameId);
    if (!wvTab) return { error: 'Tab not found' };

    const url = wvTab.webView.webContents.getURL();
    if (!url.startsWith('runever:')) {
      return { error: 'Permission denied: Not a runever: origin' };
    }

    try {
      await userApiKeyStore.setConfig(key, config);
      if (key === 'arguments') {
        getSession().setGlobalArgs(config as RunEverConfig['arguments']);
      }
      return {};
    } catch (e) {
      return { error: String(e) };
    }
  });

  ToRuneverIpc.getConfig.handle(async (_event, arg) => {
    const { frameId, key } = arg;
    console.log('getConfig in renderer process:', arg);
    const wvTab = getTab(undefined, frameId);
    if (!wvTab) return { error: 'Tab not found' };

    const url = wvTab.webView.webContents.getURL();
    if (!url.startsWith('runever:')) {
      return { error: 'Permission denied: Not a runever: origin' };
    }

    try {
      const config = await userApiKeyStore.getConfig(key);
      // Ensure we return the correct type, handling null if necessary
      // For arguments, if null, we might want to return empty array if that's what the type expects,
      // but if the store returns null it means it failed to load or key doesn't exist.
      // However, the contract expects { config: ... } | { error: ... }
      // If config is null, we might treating it as valid null result or default.
      // Given RunEverConfig, arguments is default [], so getConfig should theoretically return that.
      // If store returns null, let's return it as is or handle it.
      // Assuming mapped types handle nulls or we cast.
      return { config: config as any };
    } catch (e) {
      return { error: String(e) };
    }
  });

  ToMainIpc.newSession.handle(async (_event, currentSessionId) => {
    const currentSession = getSession(currentSessionId);
    let win = mainWindow;
    if (currentSession && (currentSession as any).mainWindow) {
      win = (currentSession as any).mainWindow;
    }
    const newSession = win.newAgenticSession();
    return { id: newSession.id };
  });

  ToMainIpc.closeSession.handle(async (_event, sessionId) => {
    const session = getSession(sessionId);
    if (session) {
      await session.end();
      return {};
    }
    return { error: 'Session not found' };
  });

  initPromptIpc();

  // User input requests are dispatched by WebViewLlmSession.askUserInput().
};
