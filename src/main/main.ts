/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
/* eslint-disable no-await-in-loop, no-restricted-syntax, no-promise-executor-return */
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { setIpcMain } from '../ipc/ipc';
import { ToMianIpc } from '../ipc/toMain';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { TabWebView } from './webView/tab';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;
const webViewTabsById = new Map<number, TabWebView>();

const PADDING = 12;
const DEFAULT_TABBAR_HEIGHT = 56;
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

setIpcMain(ipcMain);

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
      const width = vpWidth + slice.x > ttlWidth ? ttlWidth - slice.x : vpWidth;
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

    return imgs.map((img) => img.toJPEG(80));
  }
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

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
