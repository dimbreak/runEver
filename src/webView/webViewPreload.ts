import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { type EventWithDelay, ToMainIpc } from '../contracts/toMain';
import { ToRuneverIpc } from '../contracts/toRunever';
import { dummyCursor } from './cursor/cursor';
import { BrowserActions } from './actions';
import { Util } from './util';
import { Network } from './network';
import { MiniHtml } from './miniHtml';
import { type WireActionWithWaitAndRec } from '../agentic/types';
import { takeScreenshot } from './screenshot';
import type { RunEverConfig } from '../main/runeverConfigStore';
import { CommonUtil } from '../utils/common';

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
    getToken: () => ipcRenderer.invoke('get-apitrust-token'),
  },
};

const webViewHandler = {
  htmlParser: undefined as MiniHtml.Parser | undefined,
  getHtmlParser() {
    if (!this.htmlParser) this.htmlParser = new MiniHtml.Parser();
    return this.htmlParser;
  },
  getIdFromEl(el: Element, checkChildIfNotFound = true) {
    if (!this.htmlParser) this.htmlParser = new MiniHtml.Parser();
    return this.htmlParser.getIdByEl(el, checkChildIfNotFound);
  },
  getHtml(
    select: MiniHtml.Selector | null = null,
    outerLevel = 0,
    placeholdDummy = '®',
  ) {
    if (!this.htmlParser) this.htmlParser = new MiniHtml.Parser();
    if (select) {
      return dummyCursor.hide(() =>
        this.htmlParser!.genHtmlFormId(select, outerLevel),
      );
    }
    return dummyCursor.hide(() => this.htmlParser!.genFullHtml());
  },
  getDeltaHtml(placeholdDummy = '®') {
    if (!this.htmlParser) this.htmlParser = new MiniHtml.Parser();
    return dummyCursor.hide(() => this.htmlParser!.genDeltaHtml());
  },
  getEl(select: MiniHtml.Selector) {
    if (!this.htmlParser) this.htmlParser = new MiniHtml.Parser();
    return this.htmlParser.getElementFormId(select);
  },
  async execActions(
    actions: WireActionWithWaitAndRec[],
    args: Record<string, string>,
  ) {
    if (actions.length) {
      await BrowserActions.execActions(actions, args);
    }
  },
  async screenshot() {
    await takeScreenshot('test.png');
  },
  secrets: {} as Record<string, RunEverConfig['arguments'][number]>,
  domainSecrets: {} as Record<string, RunEverConfig['arguments'][number]>,
  domainSecretArgs: {} as Record<string, string>,
  setSecret(secrets: Record<string, RunEverConfig['arguments'][number]>) {
    console.log('setSecret', secrets);
    this.secrets = secrets;
    this.filterSecret();
  },
  getSecretArgs(): Record<string, string> {
    return this.domainSecretArgs;
  },
  filterSecret() {
    console.log('filterSecret', this.secrets);
    this.domainSecrets = CommonUtil.filterArgDomain(
      this.secrets,
      window.location.origin,
    );
    for (const [key, value] of Object.entries(this.domainSecrets)) {
      this.domainSecretArgs[key] = value.value;
    }
  },
};

const runeverHandler = {
  setConfig: async (key: any, config: any) => {
    console.log('setConfig', key, config);
    while (!window.frameId) {
      await Util.sleep(100);
    }
    return ToRuneverIpc.setConfig.invoke({
      frameId: window.frameId!,
      key,
      config,
    });
  },
  getConfig: async (key: any) => {
    console.log('getConfig', key);
    while (!window.frameId) {
      await Util.sleep(100);
    }
    return ToRuneverIpc.getConfig.invoke({
      frameId: window.frameId!,
      key,
    });
  },
};

contextBridge.exposeInMainWorld('isPreloadContext', false);
contextBridge.exposeInMainWorld('electron', electronHandler);
contextBridge.exposeInMainWorld('webView', webViewHandler);
if (window.location.protocol === 'runever:') {
  contextBridge.exposeInMainWorld('runever', runeverHandler);
  window.runever = runeverHandler;
}

window.electron = electronHandler;
window.webView = webViewHandler;
window.isPreloadContext = true;

export type RuneverHandler = typeof runeverHandler;
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
  window.sessionId = event.data.sessionId;

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
    sessionId: window.sessionId,
    frameId: event.data.frameId,
    scrollAdjustment,
  });
  window.removeEventListener('message', handleFrameId);
  console.log('Setting in preload:', event.data);
  // Object.keys(window).forEach((key) => {
  //   if (/^on/.test(key)) {
  //     window.addEventListener(key.slice(2), (event) => {
  //       console.log(key, event);
  //     });
  //   }
  // });
};

// Register immediately to avoid missing early postMessage during navigation.
window.addEventListener('message', handleFrameId);
window.addEventListener('DOMContentLoaded', () => tryInitCursor());
window.addEventListener('load', () => {
  tryInitCursor();
  window.webView.filterSecret();
});

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
    console.log('action done', args);
    return ToMainIpc.actionDone.invoke({
      sessionId: window.sessionId,
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
      sessionId: window.sessionId,
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
      sessionId: window.sessionId,
      frameId: window.frameId!,
      ...args,
    });
  },
  pasteInput: (args: { input: string }) => {
    return ToMainIpc.pasteInput.invoke({
      sessionId: window.sessionId,
      frameId: window.frameId!,
      ...args,
    });
  },
  setInputFile: (args: { selector: string; filePaths: string[] }) => {
    return ToMainIpc.setInputFile.invoke({
      sessionId: window.sessionId,
      frameId: window.frameId!,
      ...args,
    });
  },
  download: (args: { url: string; filename: string | undefined }) => {
    return ToMainIpc.download.invoke({
      sessionId: window.sessionId,
      frameId: window.frameId!,
      ...args,
    });
  },
});
