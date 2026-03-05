import process from 'node:process';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  shell,
  dialog,
  type Session as ElectronSession,
  type DownloadItem,
  type WebContents,
  type Event,
  type SaveDialogOptions,
} from 'electron';
// @ts-ignore
import { unusedFilenameSync } from 'unused-filename';
// @ts-ignore
import pupa from 'pupa';
// @ts-ignore
import extName from 'ext-name';
import { Session } from '../agentic/session';
import { RunEverWindow } from './window';

export class CancelError extends Error {}

export interface DownloadOptions {
  showBadge?: boolean;
  showProgressBar?: boolean;
  directory?: string;
  filename?: string;
  overwrite?: boolean;
  errorMessage?: string;
  saveAs?: boolean;
  dialogOptions?: SaveDialogOptions;
  unregisterWhenDone?: boolean;
  manualDownload?: boolean;
  openFolderWhenDone?: boolean;
  onProgress?: (progress: {
    percent: number;
    transferredBytes: number;
    totalBytes: number;
  }) => void;
  onTotalProgress?: (progress: {
    percent: number;
    transferredBytes: number;
    totalBytes: number;
  }) => void;
  onCancel?: (item: DownloadItem) => void;
  onCompleted?: (file: {
    fileName: string;
    filename: string;
    path: string;
    fileSize: number;
    mimeType: string;
    url: string;
  }) => void;
  onStarted?: (item: DownloadItem) => void;
  errorTitle?: string;
}

const getFilenameFromMime = (name: string, mime: string) => {
  const extensions = extName.mime(mime);

  if (extensions.length !== 1) {
    return name;
  }

  return `${name}.${extensions[0].ext}`;
};

function registerListener(
  session: ElectronSession,
  options: DownloadOptions,
  callback: (error: Error | null, item?: DownloadItem) => void = () => {},
) {
  const downloadItems = new Set<DownloadItem>();
  let receivedBytes = 0;
  let completedBytes = 0;
  let totalBytes = 0;
  const activeDownloadItems = () => downloadItems.size;
  const progressDownloadItems = () => receivedBytes / totalBytes;

  // eslint-disable-next-line no-param-reassign
  options = {
    showBadge: true,
    showProgressBar: true,
    ...options,
  };

  const listener = (
    event: Event,
    item: DownloadItem,
    webContents: WebContents,
  ) => {
    downloadItems.add(item);
    totalBytes += item.getTotalBytes();

    // eslint-disable-next-line no-underscore-dangle
    const window_ = webContents
      ? BrowserWindow.fromWebContents(webContents)
      : (BrowserWindow.getAllWindows()[0] ?? null);
    if (!window_) {
      throw new Error('Failed to get window from web contents.');
    }

    if (options.directory && !path.isAbsolute(options.directory)) {
      throw new Error('The `directory` option must be an absolute path');
    }

    const directory = options.directory ?? app.getPath('downloads');

    let filePath;
    if (options.filename) {
      filePath = path.join(directory, options.filename);
    } else {
      const filename = item.getFilename();
      const name = path.extname(filename)
        ? filename
        : getFilenameFromMime(filename, item.getMimeType());

      filePath = options.overwrite
        ? path.join(directory, name)
        : unusedFilenameSync(path.join(directory, name));
    }

    const errorMessage =
      options.errorMessage ?? 'The download of {filename} was interrupted';

    if (options.saveAs) {
      item.setSaveDialogOptions({
        defaultPath: filePath,
        ...options.dialogOptions,
      });
    } else {
      item.setSavePath(filePath);
    }

    item.on('updated', () => {
      receivedBytes = completedBytes;
      // eslint-disable-next-line @typescript-eslint/no-shadow
      for (const item of downloadItems) {
        receivedBytes += item.getReceivedBytes();
      }

      if (options.showBadge && ['darwin', 'linux'].includes(process.platform)) {
        app.badgeCount = activeDownloadItems();
      }

      if (!window_.isDestroyed() && options.showProgressBar) {
        window_.setProgressBar(progressDownloadItems());
      }

      if (typeof options.onProgress === 'function') {
        const itemTransferredBytes = item.getReceivedBytes();
        const itemTotalBytes = item.getTotalBytes();

        options.onProgress({
          percent: itemTotalBytes ? itemTransferredBytes / itemTotalBytes : 0,
          transferredBytes: itemTransferredBytes,
          totalBytes: itemTotalBytes,
        });
      }

      if (typeof options.onTotalProgress === 'function') {
        options.onTotalProgress({
          percent: progressDownloadItems(),
          transferredBytes: receivedBytes,
          totalBytes,
        });
      }
    });

    item.on('done', (_event, state) => {
      completedBytes += item.getTotalBytes();
      downloadItems.delete(item);

      if (options.showBadge && ['darwin', 'linux'].includes(process.platform)) {
        app.badgeCount = activeDownloadItems();
      }

      if (!window_.isDestroyed() && !activeDownloadItems()) {
        window_.setProgressBar(-1);
        receivedBytes = 0;
        completedBytes = 0;
        totalBytes = 0;
      }

      if (options.unregisterWhenDone) {
        session.removeListener('will-download', listener);
      }

      if (state === 'cancelled') {
        if (typeof options.onCancel === 'function') {
          options.onCancel(item);
        }

        callback(new CancelError());
      } else if (state === 'interrupted') {
        const message = pupa(errorMessage, {
          filename: path.basename(filePath),
        });
        callback(new Error(message));
      } else if (state === 'completed') {
        const savePath = item.getSavePath();

        if (process.platform === 'darwin') {
          app.dock?.downloadFinished(savePath);
        }

        if (options.openFolderWhenDone) {
          shell.showItemInFolder(savePath);
        }

        if (typeof options.onCompleted === 'function') {
          options.onCompleted({
            fileName: item.getFilename(), // Just for backwards compatibility. TODO: Remove in the next major version.
            filename: item.getFilename(),
            path: savePath,
            fileSize: item.getReceivedBytes(),
            mimeType: item.getMimeType(),
            url: item.getURL(),
          });
        }

        const win = BrowserWindow.fromWebContents(webContents);
        const rWin = RunEverWindow.windowById.get(win?.id ?? -1);
        console.log('downloaded', options.manualDownload, rWin);
        if (!options.manualDownload && rWin) {
          rWin.getAgenticSessions().forEach((s) => {
            s.downloaded(item);
          });
        }

        callback(null, item);
      }
    });

    if (typeof options.onStarted === 'function') {
      options.onStarted(item);
    }
  };

  session.on('will-download', listener);
}

export default function electronDl(options: DownloadOptions = {}) {
  app.on('session-created', (session) => {
    registerListener(session, options, (error, _) => {
      if (error && !(error instanceof CancelError)) {
        const errorTitle = options.errorTitle ?? 'Download Error';
        dialog.showErrorBox(errorTitle, error.message);
      }
    });
  });
}

export async function download(
  window_: RunEverWindow,
  url: string,
  options: DownloadOptions,
  retry = 0,
): Promise<DownloadItem> {
  if (retry >= 3) {
    throw new Error('Retrying to download failed');
  }
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line no-param-reassign
    options = {
      ...options,
      unregisterWhenDone: true,
      manualDownload: true,
    };

    registerListener(window_.webContents.session, options, (error, item) => {
      if (error) {
        download(window_, url, options, retry + 1)
          .then((res) => {
            resolve(res);
          })
          .catch((err) => {
            reject(err);
          });
      } else {
        resolve(item as DownloadItem);
      }
    });

    window_.webContents.downloadURL(url);
  });
}
