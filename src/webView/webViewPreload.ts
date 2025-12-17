import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { ToMainIpc } from '../contracts/toMain';
import { ToWebView } from '../contracts/toWebView';
import { defaultExecutor, defaultPlanner } from './roles/default';
import { OCRModel } from './ocr';
import { dummyCursor } from './cursor/cursor';
import { BrowserActions } from './actions';
import { Util } from './util';
import { Network } from './network';
import { PlannerStep } from './roles/system/planner.schema';
import { LlmSession } from './roles/llmSession';
import {
  ExecutorLlmResult,
  WireActionWithWaitAndRisk,
} from './roles/system/executor.schema';
import { getDeltaHtml, getHtml } from './html';

Network.initMonitor();

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
  getHtml() {
    return getHtml();
  },
  getDeltaHtml() {
    return getDeltaHtml();
  },
  getOcr(fullPage = false) {
    return OCRModel.getFromScreenshot(fullPage);
  },
  execActions(
    actions: WireActionWithWaitAndRisk[],
    args: Record<string, string>,
  ) {
    return BrowserActions.execActions(actions, args);
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);
contextBridge.exposeInMainWorld('webView', electronHandler);

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
      if (window.location.href === 'https://www.google.com/') {
        await Network.networkIdle2;
        setTimeout(() => {
          BrowserActions.execActions(
            [
              {
                k: 'input',
                // eslint-disable-next-line no-template-curly-in-string
                v: '${args.keyword}',
                q: 'textarea',
                risk: 'l',
                id: 0,
              },
              {
                k: 'key',
                key: 'Enter',
                q: 'textarea',
                a: 'keyPress',
                risk: 'l',
                id: 1,
              },
              {
                k: 'mouse',
                // eslint-disable-next-line no-template-curly-in-string
                q: 'a.zReHs:html_contains(${args.website})',
                a: 'click',
                risk: 'l',
                w: 'idle0',
                id: 2,
              },
            ],
            { keyword: 'openai', website: 'LinkedIn' },
          );
        }, 2000);
      }
    }
  };
  window.addEventListener('message', handleFrameId);
  const plannerCache: Record<string, string> = JSON.parse(
    localStorage.getItem('runEver_planner_prompt_cache') ?? '{}',
  );
  // search openai and return the url of the first article in news section
  ToWebView.RunPrompt.webviewHandle(async (req) => {
    console.log('RunPrompt', req);

    const plannerSession = defaultPlanner.newSession();
    const cached = plannerCache[req.prompt];
    let plannerRes: ReturnType<typeof plannerSession.newPrompt> extends Promise<
      infer T
    >
      ? T
      : never;
    if (cached && !req.prompt.startsWith('!')) {
      plannerRes = JSON.parse(cached);
    } else {
      plannerRes = await plannerSession.newPrompt(`[url]
${window.location.href}
[visible elements]
${JSON.stringify(await OCRModel.getFromScreenshot())}
[task prompt]
${req.prompt}`);
      plannerCache[req.prompt] = JSON.stringify(plannerRes);
      localStorage.setItem(
        'runEver_planner_prompt_cache',
        JSON.stringify(plannerCache),
      );
    }
    const executorSession = defaultExecutor.newSession();

    const args = req.args ?? {};

    while (true) {
      if (plannerRes.steps.length) {
        await runExecutor(executorSession, plannerRes.steps, args);
      }
      if (plannerRes.todo) {
      }
    }

    return {
      response: 1,
    };
  });

  // await new Promise((resolve) => setTimeout(resolve, 1000));
  // const ocrRes = await OCRModel.getFromScreenshot();
  // console.log('OCR preload screenshot response:', ocrRes);
};

const runExecutor = async (
  executorSession: LlmSession<ExecutorLlmResult>,
  steps: PlannerStep[],
  args: Record<string, any>,
) => {
  const executorRes = await executorSession.newPrompt(`[steps]
${steps
  .map((step) => {
    switch (step.risk) {
      case 'h':
        return `-BE CAREFUL high risk: ${step.action}`;
      case 'm':
        return `-medium risk: ${step.action}`;
      default:
        return `-${step.action}`;
    }
  })
  .join('\n')}`);

  if (executorRes.a.length && executorRes.a.length <= steps.length) {
    await BrowserActions.execActions(
      executorRes.a.map((action, i) => ({
        ...action,
        risk: steps[i].risk,
        id: 0,
      })),
      args ?? {},
    );
  }
  console.log('Executor preload response:', executorRes);
};
