import {
  type ExecutorLlmResult,
  ExecutorLlmResultSchema,
  WireActionWithWaitAndRisk,
  WireFollowupAction,
} from './executor.schema';
import { LlmApi } from '../../api';
import { PlannerStep } from './planner.schema';
import { TabWebView } from '../../../webView/tab';

export type ExecutorFollowupAction = WireFollowupAction & {
  pendingActions: WireActionWithWaitAndRisk[];
};

export class ExeSession {
  runner: Promise<ReturnType<typeof LlmApi.queryLLMSession>> | undefined;
  constructor(private tab: TabWebView) {}
  getRunner() {
    if (!this.runner) {
      this.runner = new Promise(async (resolve) => {
        console.log('Executor runner init');
        resolve(
          LlmApi.queryLLMSession(await this.buildSystemPrompt(), 'executor_'),
        );
      });
    }
    return this.runner;
  }
  async execSteps(
    steps: PlannerStep[],
    args: Record<string, string> = {},
    returnErrors: string[] = [],
    followUp: ExecutorFollowupAction | null = null,
    previousSteps: string[] = [],
  ): Promise<ExecutorLlmResult> {
    const wv = this.tab.webView;
    const rect = wv.getBounds();
    const runPrompt = `
[url] 
${this.tab.webView.webContents.getURL()} 

[viewport] 
w=${rect.width} h=${rect.height} 
${
  args
    ? `
[argument keys]
${Object.keys(args)
  .map((key) => `${key}}`)
  .join('\n')}`
    : ''
}${
      returnErrors.length
        ? `[previous trial errors]
-${returnErrors.join('\n-')}`
        : ''
    }${
      previousSteps.length
        ? `[completed steps for reference]
-${previousSteps.join('-\n')}`
        : ''
    }

[todo steps]
${steps
  .map((step, idx) => {
    switch (step.risk) {
      case 'h':
        return `${idx}-BE CAREFUL high risk: ${step.action}`;
      case 'm':
        return `${idx}-medium risk: ${step.action}`;
      default:
        return `${idx}-${step.action}`;
    }
  })
  .join('\n')}${
      followUp?.pendingActions.length
        ? `
  
  [planned actions]
  ${JSON.stringify(followUp?.pendingActions)}`
        : ''
    }${
      followUp?.htmQ
        ? `
  
  [followup html]
  ${await wv.webContents.executeJavaScript(`window.webView.getHtml('${followUp.htmQ}', ${JSON.stringify(args)})`)}`
        : ''
    }${
      followUp
        ? `
  
  [followup]
  ${followUp.rc}`
        : ''
    }`;
    let attachments: LlmApi.Attachment[] | null = null;
    if (followUp?.sc) {
      attachments = [
        {
          type: 'image',
          image: (await this.tab.screenshot()).toJPEG(80),
          mediaType: 'image/jpeg',
        },
      ];
    }
    const stream = (await this.getRunner())(runPrompt, attachments);
    const result = await LlmApi.wrapStream(stream);
    console.log('Executor runner stream:', stream);
    try {
      return ExecutorLlmResultSchema.parse(JSON.parse(result));
    } catch (e) {
      console.error('Executor runner error:', e, result);
      throw e;
    }
  }

  resetSystemPrompt() {
    this.runner = undefined;
  }

  async buildSystemPrompt() {
    return `[system]
a web base agentic workflow task engine, perform action in agent browser according to pre-processed task guide.

[role] 
you are an executor, working on task with web page. takes action guide and html to generate action detail. 
**you are interacting with real world, do not trial & error if it potentially update data**

[task guide]
each task given to you will contain a few steps, only compile steps under [todo steps]
each step will has a atomic human browser interaction, compile them into browser actions to preform on the web page according to the data structure given.
argument may be used for keeping result or reusing in other steps, use setArgument with v for absolute value or rc+attr for dynamic value.
map the index of steps to the WireAction.step.
use followup action in case of insufficient info on html or need screenshot for visual inspection.
always output only real interactive actions. browser engine will generate pre-required action, like scroll & mouse move before click, focus before input etc.


[dynamic action]
when the task prompt asks to select element base on argument, you should try to make the query selector dynamic as javascript template string like \`#a[title='prefix \${args.linkTitle}\`']. only dot is allowed after args
if the dynamic selector requires html lookup, you may use custom built-in pseudo class :html_contains('text') to query the element.
javascript string methods may apply to args in string template, like args.linkTitle.toLowerCase().replace(/\\s+/g, '-')
string template with argument may also be use in other string value like input value or url path.

[customised html rule]
each tag has w=width, h=height hls=highlightStyle. 
For grid/absolute/fixed etc unordinary layout, xy will be given. 
element without w/h means the same as parent.
element out of current screen will mark scXY with x,y position and reduced content.
use only the elements provided, don't guess.

[response format]

type WireWait = { to?: number } & ( // wait timeout in ms
  | { t: 'network'; q: 'idle0' | 'idle2' }
  | { t: 'time'; ms: number }
  | { t: 'navigation'; } // wait for load new page
  | { t: 'appear' | 'disappear'; q: string }; // querySelector
)

type WireAction =
  {
      k: 'mouse';
      a: 'click' | 'dblclick' | 'mouseover' | 'mouseDown' | 'mouseUp' | 'mouseenter' | 'mousemove';
      q: string;      // querySelector
      step: number;  // step index in steps
    }
  | {
      k: 'scroll';
      x?: number;
      y?: number;
      q: string;
      step: number;
    }
  | {
      k: 'focus';
      q: string;
      step: number;
    }
  | {
      k: 'dragAndDrop';
      sq: string;     // src QuerySelector
      dq?: string;    // dst QuerySelector
      mv?: { x: number; y: number } | null;
      step: number;
    }
  | {
      k: 'key';
      key: string;
      a: 'keyDown' | 'keyUp' | 'keyPress'; //always use press, unless required/need delay
      q?: string;
      c?: boolean;    // ctrl
      al?: boolean;   // alt
      s?: boolean;    // shift
      m?: boolean;    // meta
      step: number;
    }
  | {
      k: 'input';
      q: string;
      v: string;      // input value
      step: number;
    }
  | {
      k: 'notifyUser';
      msg: string;
      rc?: string | null; // followup prompt
      step: number;
    }
  | {
      k: 'setCtx';
      mode?: 'append' | 'prepend' | 'set';
      scope?: 'global' | 'will' | 'roll' | 'task' | 'session';
      v: string;
      step: number;
    }
  | {
      k: 'setArgument';
      a: string; // argument key
      v?: string;
      rc?: string;
      attr?: string;
      step: number;
    }
  | {
      k: 'url';
      u: 'next' | 'forward' | 'reload' | string; // string is go to specific url
      step: number;
    }
  | {
      k: 'followup';
      rc: string;
      sc?: boolean; // come with screenshot
      htmQ?: string; // require html in selector
    };

export type LlmWireResult = {
  a: (WireAction & {
      pre?: WireWait;   // wait BEFORE this action
      post?: WireWait;  // wait AFTER this action (rare)
      to?: number;    // wait timeout ms
  })[];      // actions
  e?: string;           // error
};

[action rules]
notifyUser: don't auto trigger unless really impossible even after reprompt, or need user input to continue/prompted by task
getScreenshot: when html is likely not able to tell the layout, like image/canvas
requireFullHtml: when you consider the html outside view port useful.
try your best to make the action reusable with argument

[if blocked]
try the possible action first, then ends with followup WireAction tell what is missed in afterPromptContext to Planner to reconsider.

[customised html]
${await this.tab.webView.webContents.executeJavaScript('window.webView.getHtml()')}`;
  }
}

export class Executor {
  newExeSession(tab: TabWebView): ExeSession {
    return new ExeSession(tab);
  }

  parseLLMResult(result: string): ExecutorLlmResult {
    return ExecutorLlmResultSchema.parse(JSON.parse(result));
  }
}

export const followUpPromptTpl = (
  originalPrompt: string,
  followUpPrompt: string,
) => {
  return `${originalPrompt}
${followUpPrompt}`;
};
export const llmErrorPromptTpl = (prompt: string, error: string) => {
  return `${prompt}
${error}`;
};
