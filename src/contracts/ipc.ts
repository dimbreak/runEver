/* eslint-disable max-classes-per-file, no-console */
import type {
  IpcMain,
  IpcMainInvokeEvent,
  IpcRendererEvent,
  WebContents,
} from 'electron';
import type { Session } from '../agentic/session';

export const isElectron =
  typeof process !== 'undefined' &&
  !!(process as any).versions &&
  !!(process as any).versions.electron;

export const isMain = isElectron && (process as any).type === 'browser';

const ipcWebViewHandlers: Record<string, (res: any) => void> = {};

class IcpContract<REQ extends Array<any>, RES = any> {
  protected _types?: { req: REQ; res: RES };

  constructor(public channel: string) {}
}

let ipcMain: IpcMain;

const onIpcMainInitialisedHandlers: Array<() => void> = [];

export function initIpcMain(main: IpcMain) {
  ipcMain = main;
  onIpcMainInitialisedHandlers.forEach((handler) => handler());
  ipcMain.on('ipcToWebViewResponse', (_, handlerId: number, res) => {
    const handler = ipcWebViewHandlers[handlerId];
    if (handler) {
      handler(res);
      delete ipcWebViewHandlers[handlerId];
    } else {
      console.error(
        'No handler found for ipcToWebViewResponse',
        handlerId,
        res,
      );
    }
  });
}

export class IpcMainContract<
  REQ extends Array<any>,
  RES = any,
> extends IcpContract<REQ, RES> {
  invoke(...args: REQ): Promise<RES> {
    if (!isMain) {
      return window.electron.ipcRenderer.invoke(this.channel, ...args);
    }
    throw new Error(
      'IcpContract.invoke can only be called from renderer process',
    );
  }

  handle(handler: (event: IpcMainInvokeEvent, ...args: REQ) => Promise<RES>) {
    if (isMain) {
      if (!ipcMain) {
        throw new Error(
          'IpcMainContract.handle ipcMain is not set. Did you forget to call setIpcMain()?',
        );
      }
      ipcMain.handle(this.channel, handler);
      return;
    }
    throw new Error('IcpContract.handle can only be called from main process');
  }
}

export class IcpRendererContract<
  REQ extends Array<any>,
> extends IcpContract<REQ> {
  send(webContents: WebContents, ...args: REQ) {
    webContents.send(this.channel, ...args);
  }

  on(handler: (event: IpcRendererEvent, ...args: REQ) => void) {
    if (!isMain && window?.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on(this.channel, handler);
    }
    // throw new Error('IcpContract.on can only be called from renderer process');
  }
}
type Tail<T extends any[]> = T extends [any, ...infer R] ? R : never;
