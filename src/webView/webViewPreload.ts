import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { type EventWithDelay, ToMainIpc } from '../contracts/toMain';
import { OCRModel } from './ocr';
import { dummyCursor } from './cursor/cursor';
import { BrowserActions } from './actions';
import { Util } from './util';
import { Network } from './network';
import { MiniHtml } from './miniHtml';
import { type WireActionWithWaitAndRec } from '../agentic/types';

Network.initListener();

const electronHandler = {
  ipcRenderer: {
    invoke(channel: string, ...args: any[]) {
      return ipcRenderer.invoke(channel, ...args);
    },
    send(channel: string, ...args: any[]) {
      return ipcRenderer.send(channel, ...args);
    },
    on(
      channel: string,
      func: (_event: IpcRendererEvent, ...args: any[]) => void,
    ) {
      ipcRenderer.on(channel, func);

      return () => {
        ipcRenderer.removeListener(channel, func);
      };
    },
    once(
      channel: string,
      func: (_event: IpcRendererEvent, ...args: any[]) => void,
    ) {
      ipcRenderer.once(channel, func);
    },
    postMessage(message: any) {
      postMessage(message, '*');
    },
  },
  apiTrust: {
    getEnv: () => ipcRenderer.invoke('get-apitrust-env'),
  },
};

const webViewHandler = {
  htmlParser: undefined as MiniHtml.Parser | undefined,
  getHtmlParser() {
    if (!this.htmlParser) this.htmlParser = new MiniHtml.Parser();
    console.log(this.htmlParser);
    return this.htmlParser;
  },
  getHtml(
    select: MiniHtml.Selector | null = null,
    outerLevel = 0,
    placeholdDummy = '__',
  ) {
    if (!this.htmlParser) this.htmlParser = new MiniHtml.Parser();
    if (select) {
      return dummyCursor.hide(() =>
        this.htmlParser!.genHtmlFormId(select, outerLevel),
      );
    }
    return dummyCursor.hide(() => this.htmlParser!.genFullHtml());
  },
  getDeltaHtml(placeholdDummy = '__') {
    if (!this.htmlParser) this.htmlParser = new MiniHtml.Parser();
    return dummyCursor.hide(() => this.htmlParser!.genDeltaHtml());
  },
  getEl(select: MiniHtml.Selector) {
    if (!this.htmlParser) this.htmlParser = new MiniHtml.Parser();
    return this.htmlParser.getElementFormId(select);
  },
  getOcr(fullPage = false) {
    return OCRModel.getFromScreenshot(fullPage);
  },
  async execActions(
    actions: WireActionWithWaitAndRec[],
    args: Record<string, string>,
  ) {
    if (actions.length) {
      await BrowserActions.execActions(actions, args);
    }
  },
};

contextBridge.exposeInMainWorld('isPreloadContext', false);
contextBridge.exposeInMainWorld('electron', electronHandler);
contextBridge.exposeInMainWorld('webView', webViewHandler);

window.electron = electronHandler;
window.webView = webViewHandler;
window.isPreloadContext = true;

export type WebViewHandler = typeof webViewHandler;

let pendingCursorInit: { x: number; y: number } | null = null;

const tryInitCursor = () => {
  if (!pendingCursorInit) return;
  if (!document.body) return;
  dummyCursor.init(pendingCursorInit.x, pendingCursorInit.y);
  pendingCursorInit = null;
};

const handleFrameId = async (event: MessageEvent) => {
  if (!event?.data?.frameId) return;
  window.frameId = event.data.frameId;

  // Cursor needs <body>; if message arrives early, defer.
  pendingCursorInit = {
    x: event.data.mouseX ?? -1,
    y: event.data.mouseY ?? -1,
  };
  tryInitCursor();

  let scrollAdjustment: number | undefined;
  if (event.data.scrollAdjustment === 0) {
    scrollAdjustment = await Util.testScrollAdjustment(event.data.frameId);
  }
  Util.scrollAdjustmentLock.unlock(
    scrollAdjustment ?? event.data.scrollAdjustment,
  );
  ToMainIpc.bindFrameId.invoke({
    id: event.data.frameId,
    scrollAdjustment,
  });
  console.log('Setting in preload:', event.data);
  window.removeEventListener('message', handleFrameId);
  // const events = [];
  // for (const property in window) {
  //   if (property.startsWith('on')) {
  //     events.push(property);
  //     window[property] = (ev) => {
  //       console.log(property, ev);
  //     };
  //   }
  // }
  // console.log(events.join(' '));
  //
  // await Util.sleep(2000);
  //
  // document.body.querySelector('input')?.focus();
  // BrowserActions.callActionApi({
  //   action: 'pasteInput',
  //   args: { input: '你好，世界' },
  // });
};

// Register immediately to avoid missing early postMessage during navigation.
window.addEventListener('message', handleFrameId);
window.addEventListener('DOMContentLoaded', () => tryInitCursor());
window.addEventListener('load', () => tryInitCursor());

// Warm up cache (kept for compatibility with existing behavior).
try {
  JSON.parse(localStorage.getItem('runEver_planner_prompt_cache') ?? '{}');
} catch {
  // ignore invalid cache
}

BrowserActions.setActionApi({
  actionDone: (args: {
    actionId: number;
    argsDelta?: Record<string, string> | undefined;
    iframeId?: string;
  }) => {
    return ToMainIpc.actionDone.invoke({
      frameId: window.frameId!,
      ...args,
    });
  },
  actionError: (args: {
    actionId: number;
    error: string;
    iframeId?: string;
  }) => {
    return ToMainIpc.actionError.invoke({
      frameId: window.frameId!,
      ...args,
    });
  },
  dispatchNativeKeypress: (args: {
    keyAndDelays: [ToMainIpc.NativeKeys, number][];
  }) => {
    return ToMainIpc.dispatchNativeKeypress.invoke(args);
  },
  dispatchEvents: (args: { events: EventWithDelay[] }) => {
    return ToMainIpc.dispatchEvents.invoke({
      frameId: window.frameId!,
      ...args,
    });
  },
  pasteInput: (args: { input: string }) => {
    return ToMainIpc.pasteInput.invoke({
      frameId: window.frameId!,
      ...args,
    });
  },
  setInputFile: (args: { selector: string; filePaths: string[] }) => {
    return ToMainIpc.setInputFile.invoke({
      frameId: window.frameId!,
      ...args,
    });
  },
});
