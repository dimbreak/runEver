import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { type EventWithDelay, ToMainIpc } from '../contracts/toMain';
import { OCRModel } from './ocr';
import { dummyCursor } from './cursor/cursor';
import { BrowserActions } from './actions';
import { Util } from './util';
import { Network } from './network';
import { MiniHtml } from './miniHtml';
import { WireActionWithWaitAndRec } from '../agentic/session';

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

window.onload = async () => {
  const handleFrameId = async (event: MessageEvent) => {
    if (event.data.frameId) {
      window.frameId = event.data.frameId;
      dummyCursor.init(event.data.mouseX, event.data.mouseY);
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
      //
      // const events = [];
      // for (const property in window) {
      //   if (property.startsWith('on')) {
      //     events.push(property);
      //     (window as any)[property] = (ev: any) => {
      //       console.log(property, ev);
      //     };
      //   }
      // }
      // console.log(events.join(' '));
      //
      // await Util.sleep(500);
      // //
      // BrowserActions.input(
      //   {
      //     k: 'input',
      //     q: '__x',
      //     v: [`Japanese`, 'English'],
      //   },
      //   'l',
      //   {},
      // );
    }
  };
  window.addEventListener('message', handleFrameId);
};

BrowserActions.setActionApi({
  actionDone: (args: {
    actionId: number;
    argsDelta?: Record<string, string> | undefined;
  }) => {
    return ToMainIpc.actionDone.invoke({
      frameId: window.frameId!,
      ...args,
    });
  },
  actionError: (args: { actionId: number; error: string }) => {
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
