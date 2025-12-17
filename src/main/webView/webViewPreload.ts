import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { ToMainIpc } from '../../contracts/toMain';
import { ToWebView } from '../../contracts/toWebView';
import { defaultExecutor, defaultPlanner } from '../../injection/roles/default';
import { OCRModel } from '../../injection/ocr';
import { dummyCursor } from '../../injection/cursor/cursor';
import { BrowserActions } from '../../injection/actions';
import { Util } from '../../injection/util';
import { replaceJsTpl } from '../../injection/selector';

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

contextBridge.exposeInMainWorld('electron', electronHandler);

window.electron = electronHandler;

const testScrollAdjustment = async (frameId: number) => {
  return new Promise<number>(async (resolve) => {
    const { scrollX, scrollY } = window;
    const scrollHandler = (e: WheelEvent) => {
      if (e.deltaY === -1 && e.deltaX === -1) {
        resolve(-1);
      } else {
        resolve(1);
      }
      window.scrollTo(scrollX, scrollY);
      window.removeEventListener('wheel', scrollHandler);
    };
    window.addEventListener('wheel', scrollHandler);
    await ToMainIpc.dispatchEvents.invoke({
      frameId,
      events: [
        {
          type: 'mouseWheel',
          deltaX: 1,
          deltaY: 1,
          x: 0,
          y: 0,
          scrollEl: '',
        },
      ],
    });
  });
};

window.onload = async () => {
  const handleFrameId = async (event: MessageEvent) => {
    if (event.data.frameId) {
      window.frameId = event.data.frameId;
      dummyCursor.init(event.data.mouseX, event.data.mouseY);
      let scrollAdjustment: number | undefined;
      if (event.data.scrollAdjustment === 0) {
        scrollAdjustment = await testScrollAdjustment(event.data.frameId);
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
      if (
        event.data.actions &&
        Array.isArray(event.data.actions) &&
        event.data.actions.length
      ) {
        console.log('Got actions from main:', event.data.actions);
        BrowserActions.runSet(
          event.data.actions,
          event.data.actionArgs ?? {},
          true,
        );
      } else if (window.location.href === 'https://www.google.com/') {
        setTimeout(() => {
          BrowserActions.runSet(
            [
              { k: 'input', v: '${args.keyword}', q: 'textarea' },
              {
                k: 'key',
                key: 'Enter',
                q: 'textarea',
                a: 'keyPress',
              },
              {
                k: 'mouse',
                q: 'a.zReHs:html_contains(${args.website})',
                a: 'click',
              },
            ],
            { keyword: 'openai', website: 'Wikipedia' },
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
    const executorRes = await executorSession.newPrompt(`[steps]
${plannerRes.steps
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

    console.log('Executor preload response:', executorRes);

    return {
      response: executorRes,
    };
  });

  // await new Promise((resolve) => setTimeout(resolve, 1000));
  // const ocrRes = await OCRModel.getFromScreenshot();
  // console.log('OCR preload screenshot response:', ocrRes);
};
