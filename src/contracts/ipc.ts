/* eslint-disable max-classes-per-file, no-console */
import type {
  IpcMain,
  IpcMainInvokeEvent,
  IpcRendererEvent,
  WebContents,
} from 'electron';
import { TabWebView } from '../main/webView/tab';

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
let webViewTabsById: Map<number, TabWebView>;

const onIpcMainInitialisedHandlers: Array<() => void> = [];

export function initIpcMain(main: IpcMain, tabsById: Map<number, TabWebView>) {
  ipcMain = main;
  webViewTabsById = tabsById;
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
    if (!isMain) {
      window.electron.ipcRenderer.on(this.channel, handler);
      return;
    }
    throw new Error('IcpContract.on can only be called from renderer process');
  }
}
type Tail<T extends any[]> = T extends [any, ...infer R] ? R : never;

export class IpcWebViewContract<
  REQ extends [number, ...any],
  RES = any,
> extends IpcMainContract<REQ, RES | Error> {
  constructor(channel: string) {
    super(channel);
    if (isMain) {
      console.log('wait IpcWebViewContract inited');
      onIpcMainInitialisedHandlers.push(() => {
        ipcMain.handle(this.channel, async (event, ...args: REQ) =>
          this.invokeFromMain(...args),
        );
      });
    }
  }
  async invokeFromMain(...args: REQ): Promise<Error | RES> {
    const wv =
      args[0] === -1
        ? webViewTabsById.values().next().value
        : webViewTabsById.get(args[0]);
    if (wv) {
      console.log(`ipcInvoke:${this.channel}`, args);
      const reqId = Date.now() * 100 + Math.floor(Math.random() * 100);
      const promise = new Promise<RES>((resolve) => {
        ipcWebViewHandlers[reqId] = resolve;
        wv.webView.webContents.send(
          `ipcInvoke:${this.channel}`,
          reqId,
          ...args.slice(1),
        );
      });
      console.log('ipcInvoke promise', reqId);
      return promise;
    }
    console.error('No tab found with id invokeFromMain', this.channel, args[0]);
    return new Error(`No tab found with id ${args[0]}`);
  }
  webviewHandle(handler: (...args: Tail<REQ>) => Promise<RES>) {
    window.electron.ipcRenderer.on(
      `ipcInvoke:${this.channel}`,
      async (_event, ...args: REQ) => {
        const res = await handler(...(args.slice(1) as Tail<REQ>));
        window.electron.ipcRenderer.send(`ipcToWebViewResponse`, args[0], res);
      },
    );
  }
}
