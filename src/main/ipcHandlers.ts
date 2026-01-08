import { exec } from 'child_process';
import { BrowserWindow, clipboard, ipcMain, MouseInputEvent } from 'electron';
import settings from 'electron-settings';
import { ToMainIpc } from '../contracts/toMain';
import { initIpcMain } from '../contracts/ipc';
import '../contracts/toWebView'; // for initalise bridge handlers
import {
  openBrowserWindowDialog,
  openPromptInputDialog,
  showSystemMessageBox,
} from './dialogs';
import { TabWebView } from './webView/tab';
import { Util } from '../webView/util';
import { LlmApi } from './llm/api';
import { promptAttachmentsSchema } from '../schema/attachments';

function initPromptIpc(webViewTabsById: Map<number, TabWebView>) {
  ToMainIpc.actionDone.handle(async (event, arg) => {
    console.log('Pop actions:', arg);
    const { frameId, actionId, argsDelta } = arg;
    const wvTab = webViewTabsById.get(frameId);
    if (wvTab) {
      wvTab.actionDone(actionId, argsDelta);
      return true;
    }
    return false;
  });
  ToMainIpc.actionError.handle(async (event, arg) => {
    console.log('Err actions:', arg);
    const { frameId, actionId, error } = arg;
    const wvTab = webViewTabsById.get(frameId);
    if (wvTab) {
      wvTab.actionError(error, actionId);
      return true;
    }
    return false;
  });
  ToMainIpc.iframeProgress.handle(async (event, arg) => {
    const { frameId, type, iframeId } = arg;
    const wvTab = webViewTabsById.get(frameId);
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
    const parsedAttachments = attachments
      ? (() => {
          const parsed = promptAttachmentsSchema.safeParse(attachments);
          if (!parsed.success) return { error: 'Invalid attachments payload' };
          return { value: parsed.data };
        })()
      : { value: undefined };
    const wvTab = webViewTabsById.get(frameId);
    console.info('runPrompt in main process:', arg);
    if ('error' in parsedAttachments) return { error: parsedAttachments.error };
    if (wvTab) {
      const error = await wvTab.runPrompt(
        requestId,
        prompt,
        args,
        parsedAttachments.value,
        reasoningEffort,
        modelType,
      );
      return { error };
    }
    return { error: 'Tab not found' };
  });

  ToMainIpc.stopPrompt.handle(async (_event, arg) => {
    const { frameId, requestId } = arg;
    const wvTab = webViewTabsById.get(frameId);
    if (!wvTab) return { stopped: false, error: 'Tab not found' };
    wvTab.stopPrompt(requestId);
    return { stopped: true };
  });

  ToMainIpc.getTabNavigationState.handle(async (_event, arg) => {
    const wvTab = webViewTabsById.get(arg.frameId);
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
    const wvTab = webViewTabsById.get(arg.frameId);
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

export const setupIpcHandlers = (mainWindow: BrowserWindow) => {
  const webViewTabsById = new Map<number, TabWebView>();
  const closedFrameIds = new Set<number>();

  const PADDING = 0;
  const DEFAULT_TABBAR_HEIGHT = 112;
  const DEFAULT_SIDEBAR_WIDTH = 430;

  type SafeBoundsOptions = {
    sidebarWidth?: number;
    tabbarHeight?: number;
    viewportWidth?: number;
  };

  const getSafeBounds = (opts: SafeBoundsOptions = {}) => {
    const sidebarWidth = opts.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH;
    const tabbarHeight = opts.tabbarHeight ?? DEFAULT_TABBAR_HEIGHT;

    const win = mainWindow?.getBounds();
    const devtoolsWidth = win.width - (opts.viewportWidth ?? 0);
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

  const cleanupTab = (frameId: number) => {
    if (closedFrameIds.has(frameId)) return;
    closedFrameIds.add(frameId);

    const wvTab = webViewTabsById.get(frameId);
    if (wvTab) {
      try {
        wvTab.stopPrompt();
      } catch {
        // ignore cleanup errors
      }
      try {
        wvTab.webView.setVisible(false);
      } catch {
        // ignore cleanup errors
      }
      try {
        mainWindow?.contentView.removeChildView(wvTab.webView);
      } catch {
        // ignore cleanup errors
      }
      webViewTabsById.delete(frameId);
    }

    try {
      mainWindow?.webContents.send('tab-closed', { frameId });
    } catch {
      // ignore teardown errors
    }
  };

  // const removeAllWebViews = () => {
  //   webViewTabsById.forEach((tab) => {
  //     mainWindow?.contentView.removeChildView(tab.webView);
  //   });
  //   webViewTabsById.clear();
  //   tabIdToFrameId.clear();
  // };

  console.log('starting main process ipc-example');
  initIpcMain(ipcMain, webViewTabsById);

  ToMainIpc.bindFrameId.handle(async (event, arg) => {
    const wvTab = webViewTabsById.get(arg.id);
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
    const wvTab = webViewTabsById.get(frameId);
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
    console.log('takeScreenshot error:', frameId, webViewTabsById);
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
    const bounds = detail.bounds ?? getSafeBounds();
    const wvTab = new TabWebView(detail.url, bounds, mainWindow);
    const frameId = wvTab.webView.webContents.id;
    wvTab.webView.webContents.once('destroyed', () => cleanupTab(frameId));
    wvTab.webView.webContents.on('render-process-gone', () =>
      cleanupTab(frameId),
    );
    webViewTabsById.set(frameId, wvTab);
    mainWindow?.contentView.addChildView(wvTab.webView);
    return { id: frameId };
  });

  ToMainIpc.operateTab.handle(async (event, detail) => {
    const frameId = detail.id;
    const wvTab = frameId ? webViewTabsById.get(frameId) : undefined;
    if (wvTab) {
      let response;
      if (detail.close) {
        // Ensure any in-flight prompt/task is stopped before destroying webContents.
        wvTab.stopPrompt();
        wvTab.webView.setVisible(false);
        mainWindow?.contentView.removeChildView(wvTab.webView);
        webViewTabsById.delete(frameId!);
        if (!wvTab.webView.webContents.isDestroyed()) {
          wvTab.webView.webContents.close();
        }
        response = 'closed';
      } else {
        if (detail.visible !== undefined) {
          wvTab.webView.setVisible(detail.visible);
        }
        if (detail.bounds) {
          wvTab.webView.setBounds(detail.bounds);
        } else if (!detail.url && !detail.exeScript) {
          wvTab.webView.setBounds(
            getSafeBounds({
              sidebarWidth: detail.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH,
              tabbarHeight: detail.tabbarHeight ?? DEFAULT_TABBAR_HEIGHT,
              viewportWidth: detail.viewportWidth,
            }),
          );
        }
        if (detail.url) {
          wvTab.webView.webContents.loadURL(detail.url);
          await Util.sleep(1000);
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

  ToMainIpc.responsePromptInput.handle(async (_event, arg) => {
    TabWebView.resolveUserInput(arg.id, arg.answer);
  });

  ToMainIpc.dispatchEvents.handle(async (event, arg) => {
    const { frameId, events } = arg;
    const wvTab = frameId ? webViewTabsById.get(frameId) : undefined;
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
    const wvTab = frameId ? webViewTabsById.get(frameId) : undefined;
    if (wvTab) {
      await wvTab.pasteText(input);
      return true;
    }
    return false;
  });
  ToMainIpc.setInputFile.handle(async (event, arg) => {
    console.log('setInputFile:', arg);
    const { frameId, selector, filePaths } = arg;
    const wvTab = frameId ? webViewTabsById.get(frameId) : undefined;
    if (wvTab) {
      return { error: await wvTab.setInputFile(selector, filePaths) };
    }
    return { error: 'Tab not found' };
  });
  initPromptIpc(webViewTabsById);

  // User input requests are dispatched by TabWebView.askUserInput().
};
