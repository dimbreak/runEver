import type {
  IpcMain,
  IpcMainInvokeEvent,
  IpcRendererEvent,
  WebContents,
} from 'electron';

export const isElectron =
  typeof process !== 'undefined' &&
  !!(process as any).versions &&
  !!(process as any).versions.electron;

export const isMain = isElectron && (process as any).type === 'browser';

class IcpContract<REQ extends Array<any>, RES = any> {
  constructor(public channel: string) {}
}

let ipcMain: IpcMain;

export function setIpcMain(main: IpcMain) {
  ipcMain = main;
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
  RES = any,
> extends IcpContract<REQ, RES> {
  send(webContents: WebContents, ...args: REQ) {
    webContents.send(this.channel, ...args);
  }

  on(handler: (event: IpcRendererEvent, ...args: REQ) => void) {
    if (!isMain) {
      window.electron.ipcRenderer.on(this.channel, handler);
      return;
    }
    throw new Error('IcpContract.on can only be called from renderer process');
  }
}
