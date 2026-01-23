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
import { config as configDotEnv } from 'dotenv';
import { app, BrowserWindow, session, protocol, net } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import fs from 'fs';
// @ts-ignore
import electronDl from 'electron-dl';
import { setupIpcHandlers } from './ipcHandlers';
import { WebViewLlmSession } from '../agentic/webviewLlmSession';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

const output = configDotEnv({
  debug: true,
});

console.log('dotenv output', output);

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'runever',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      allowServiceWorkers: true,
      corsEnabled: true,
    },
  },
]);

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
  const sess = session.defaultSession;
  const extPath = path.join(__dirname, '../extensions/iframe');

  try {
    const ext = await sess.loadExtension(extPath, { allowFileAccess: true });
    console.log('Extension loaded:', ext.name);
  } catch (e) {
    console.error('Failed to load extension:', e);
  }

  mainWindow = new BrowserWindow({
    show: false,
    width: 2700,
    height: 1020,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      devTools: true,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });
  mainWindow.webContents.on(
    'did-fail-load',
    (e, code, desc, url, isMainFrame) => {
      console.error('[wc] did-fail-load', { code, desc, url, isMainFrame });
    },
  );

  mainWindow.webContents.on('render-process-gone', (e, details) => {
    console.error('[wc] render-process-gone', details);
  });
  mainWindow.on('closed', () => console.log('[main] win closed'));
  mainWindow.on('close', () => console.log('[main] win close'));

  mainWindow.webContents.on('did-start-loading', () =>
    console.log('[wc] did-start-loading'),
  );
  mainWindow.webContents.on('did-stop-loading', () =>
    console.log('[wc] did-stop-loading'),
  );

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

  mainWindow.webContents.setWindowOpenHandler(() => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        frame: false,
        fullscreenable: false,
        backgroundColor: 'black',
        webPreferences: {
          devTools: false,
          // preload: 'my-child-window-preload-script.js'
        },
      },
    };
  });

  const llmSession = new WebViewLlmSession(mainWindow);
  setupIpcHandlers(mainWindow, llmSession);

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

app.commandLine.appendSwitch('disable-site-isolation-trials');

electronDl();

app
  .whenReady()
  .then(() => {
    const baseDir = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'runEverMark')
      : path.join(app.getAppPath(), 'assets', 'runEverMark');
    protocol.handle('runever', async (request) => {
      const url = new URL(request.url);

      // 只處理 runever://benchmark/...
      if (url.hostname !== 'benchmark') {
        return new Response('Not found', { status: 404 });
      }

      // pathname 例如 "/css/app.css"
      let rel = decodeURIComponent(url.pathname || '/');
      if (rel === '/') rel = '/index.html';

      // ✅ normalize + 防 ../
      const abs = path.resolve(baseDir, `.${rel}`);
      if (
        !abs.startsWith(path.resolve(baseDir) + path.sep) &&
        abs !== path.resolve(baseDir)
      ) {
        return new Response('Forbidden', { status: 403 });
      }

      // ✅ 檔案存在就直接 serve
      try {
        await fs.accessSync(abs);
        return net.fetch(`file://${abs}`);
      } catch {
        // ✅ SPA fallback：任何未知 route -> index.html
        const indexPath = path.join(baseDir, 'index.html');
        return net.fetch(`file://${indexPath}`);
      }
    });

    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
