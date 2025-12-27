import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { ToMainIpc } from '../contracts/toMain';
import { OCRModel } from './ocr';
import { dummyCursor } from './cursor/cursor';
import { BrowserActions } from './actions';
import { Util } from './util';
import { Network } from './network';
import { WireActionWithWaitAndRisk } from '../main/llm/roles/system/executor.schema';
import { getDeltaHtml, getHtml, getHtmlFromNode } from './html';
import { querySelectAll } from './selector';

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
  getHtml(
    selector: string | null = null,
    args: Record<string, string> = {},
    outerLevel = 0,
  ) {
    if (selector) {
      return querySelectAll(selector, args)
        .map((el) => {
          let thisEl = el;
          if (outerLevel) {
            for (let i = 0; i < outerLevel; i++) {
              if (!thisEl.parentElement || thisEl === document.body) {
                break;
              }
              thisEl = thisEl.parentElement;
            }
          }
          return getHtmlFromNode(thisEl as HTMLElement);
        })
        .join('\n');
    }
    return getHtml();
  },
  getDeltaHtml() {
    return getDeltaHtml();
  },
  getOcr(fullPage = false) {
    return OCRModel.getFromScreenshot(fullPage);
  },
  async execActions(
    actions: WireActionWithWaitAndRisk[],
    args: Record<string, string>,
  ) {
    if (actions.length) {
      await BrowserActions.execActions(actions, args);
    }
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);
contextBridge.exposeInMainWorld('webView', webViewHandler);

window.electron = electronHandler;
window.webView = webViewHandler;

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
    }
  };
  window.addEventListener('message', handleFrameId);
  const plannerCache: Record<string, string> = JSON.parse(
    localStorage.getItem('runEver_planner_prompt_cache') ?? '{}',
  );
};
