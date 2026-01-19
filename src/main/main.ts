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
import { app, BrowserWindow, session } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { setupIpcHandlers } from './ipcHandlers';
import { WebViewLlmSession } from '../agentic/webviewLlmSession';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { ToRendererIpc } from '../contracts/toRenderer';
import {
  peekPendingAuthDeepLink,
  setPendingAuthDeepLink,
} from './authDeepLink';

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

const protocolName = 'runever';

const getDeepLinkFromArgs = (argv: string[]) => {
  return argv.find((arg) => arg.startsWith(`${protocolName}://`)) ?? null;
};

const isAppUrl = (url: string) => {
  const appUrl = resolveHtmlPath('index.html');
  const appBaseUrl = appUrl.replace(/index\.html$/, '');
  return url.startsWith(appUrl) || url.startsWith(appBaseUrl);
};

const normalizeDeepLinkPath = (url: URL) => {
  const rawPath = url.host ? `/${url.host}${url.pathname}` : url.pathname || '/';
  const trimmed =
    rawPath.endsWith('/') && rawPath !== '/' ? rawPath.slice(0, -1) : rawPath;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const buildAppUrlForDeepLink = (urlString: string) => {
  const appUrl = resolveHtmlPath('index.html');
  const url = new URL(urlString);
  const normalizedPath = normalizeDeepLinkPath(url);
  const search = url.searchParams.toString();
  if (search) {
    return `${appUrl}?${search}#${normalizedPath}`;
  }
  return `${appUrl}#${normalizedPath}`;
};

const sendDeepLinkToRenderer = (url: string) => {
  setPendingAuthDeepLink(url);
  if (!mainWindow) return;

  const currentUrl = mainWindow.webContents.getURL();
  if (currentUrl && !isAppUrl(currentUrl)) {
    mainWindow.loadURL(buildAppUrlForDeepLink(url));
    return;
  }
  if (!mainWindow.webContents.isLoading()) {
    ToRendererIpc.authDeepLink.send(mainWindow.webContents, { url });
  }
};

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
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  const pendingDeepLink = peekPendingAuthDeepLink();
  const appUrl = pendingDeepLink
    ? buildAppUrlForDeepLink(pendingDeepLink)
    : resolveHtmlPath('index.html');
  mainWindow.loadURL(appUrl);

  mainWindow.webContents.on('did-finish-load', () => {
    const pending = peekPendingAuthDeepLink();
    if (pending) {
      sendDeepLinkToRenderer(pending);
    }
  });

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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${protocolName}://`)) {
      sendDeepLinkToRenderer(url);
      return { action: 'deny' };
    }
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

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${protocolName}://`)) {
      event.preventDefault();
      sendDeepLinkToRenderer(url);
    }
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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = getDeepLinkFromArgs(argv);
    if (url) {
      sendDeepLinkToRenderer(url);
    }
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  sendDeepLinkToRenderer(url);
});

app
  .whenReady()
  .then(() => {
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(
          protocolName,
          process.execPath,
          [path.resolve(process.argv[1])],
        );
      }
    } else {
      app.setAsDefaultProtocolClient(protocolName);
    }
    createWindow();
    const initialDeepLink = getDeepLinkFromArgs(process.argv);
    if (initialDeepLink) {
      sendDeepLinkToRenderer(initialDeepLink);
    }
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
