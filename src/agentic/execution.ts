import {
  type ExecutorLlmResult,
  ExecutorLlmResultSchema,
  WireActionWithWait,
  WireActionWithWaitSchema,
} from './execution.schema';
import { LlmApi } from './api';
import { TabWebView } from '../main/webView/tab';
import {
  JsonStreamingEvent,
  JsonStreamingEventType,
  JsonStreamingParser,
} from '../main/llm/jsonStreamer';

export class ExecutionSession {
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
  async *execPrompt(
    taskPrompt: string,
    args: Record<string, string> = {},
    requireScreenshot = false,
  ): AsyncGenerator<WireActionWithWait, ExecutorLlmResult, void> {
    const wv = this.tab.webView;
    const rect = wv.getBounds();
    const runner = await this.getRunner();
    const htmlDeltas = await this.tab.webView.webContents.executeJavaScript(
      'window.webView.getDeltaHtml()',
    );
    console.log('Executor html deltas', htmlDeltas);
    const runPrompt = `
[url] 
${this.tab.webView.webContents.getURL()} 

[viewport] 
w=${rect.width} h=${rect.height} 
${
  args && Object.keys(args).length
    ? `
[argument keys]
${Object.entries(args)
  .map((arg) => `${arg[0]}: ${arg[1]}`)
  .join('\n')}`
    : ''
}

[task prompt]
${taskPrompt}`;
    let attachments: LlmApi.Attachment[] | null = null;
    if (requireScreenshot) {
      attachments = [
        {
          type: 'image',
          image: (await this.tab.screenshot()).toJPEG(80),
          mediaType: 'image/jpeg',
        },
      ];
    }
    console.log('Executor runner prompt:', runPrompt);
    const stream = runner(runPrompt, attachments, 'mid', 'low');
    const jsonParser = new JsonStreamingParser(true);
    console.log('Executor runner stream:', stream);

    let events: JsonStreamingEvent[];
    let event: JsonStreamingEvent;
    let actionStage = 0;
    for await (const chunk of stream) {
      events = jsonParser.push(chunk);
      for (event of events) {
        if (event.type === JsonStreamingEventType.Array) {
          if (event.key === 'a') {
            actionStage++;
          }
        } else if (
          event.type === JsonStreamingEventType.Object &&
          event.endValue
        ) {
          if (actionStage === 1 && typeof event.key === 'number') {
            const step = WireActionWithWaitSchema.safeParse(event.endValue);
            if (step.success) {
              yield step.data;
            } else {
              console.warn('Exec step error:', step.error);
            }
          } else if (event.key === null) {
            console.log('Exec result:', event.endValue);
            return ExecutorLlmResultSchema.parse(event.endValue);
          }
        }
      }
    }
    console.log('Exec end no result');
    return ExecutorLlmResultSchema.parse(JSON.parse(jsonParser.readAll()));
  }

  resetSystemPrompt() {
    this.runner = undefined;
  }

  async buildSystemPrompt() {
    console.log('Executor runner build sys prompt');
    return `[system]
a web base agentic workflow task engine, perform action in agent browser according to pre-processed task guide.

[role] 
you are an executor, working on task with web page. taking user tasks prompt and compile into actions to perform on the browser.
**you are interacting with real world, do not trial & error if it potentially update data**

[guide]
 - user task prompt may contain task work across multiple pages. You only plan actions doable in **the current content found in [customized html]**.
 - every action need to be able to connect with **at least one element** in [customized html] provided, otherwise it is invalid.
 - when task cannot be continue with current info, try perform possible actions and put followup prompt in todo. content may appear after that and it will resent after page state changed automatically with page updates.
 - limit actions to 5 in one batch of response to avoid losing focus, it may even be fewer if the action is in high risk, put the remaining in todo.
 - All actions operate only on the currently visible page content by default. Searching, or navigating for extra is not allowed unless the task explicitly asks for it.
 - Destructive actions must be bound to a visible UI element.Keyboard shortcuts are not allowed for delete/remove unless explicitly requested by the task or stated on the UI.

 - you should:
 - explain intention in WireStep.intent with very short natual language before action, like "click the submit button", "fill in user name" etc
 - assign a risk level to each step
 - assume the url is opened and perform task on current page.
 - **only botherUser when the task is really unclear or impossible** to be done, user feedback will send to you again if asked.
 - you may return result by setting argument.
 - provide key actions. browser engine will trigger pre-required action if possible, like focus before input, scroll and mouse move before click etc. 
 - prefer submit form with enter key over click button if input/focused on form element in previous step.
 - only use todo.sc in case of the html does not make much sense on task prompt, like many of media tags without alt/title.
 - only apply LlmWireResult.clearQueue when fixing error.
 - focus on [todo prompt] or [action error] if they appear in task prompt, task prompt should remind you what to do next.
 - aware of [performed actions] comes with [todo prompt], take what have been done in to account to avoid duplication, just do the new actions.
 
- todo rules:
 - todo is for reminding yourself in next request, keep it minimal to explain what is left to do.
 - page state will be updated and resend, avoid mentioning in todo to confuse next request.
 - write todo base on assumption that all waiting and action has been done before in current response and what have been done will send with todo.
  
- risk levels:
 - risk = 'l' | 'm' | 'h' - 'l' (low) = scroll, click navigation link/button, mouse over, simple search, open page
 - 'm' (mid) = fill form fields, drag & drop, submit data
 - 'h' (high) = delete/remove, payment/checkout, irreversible settings, sensitive data operations
 - always prioritise caution if user prompt mentions danger, careful, payment, delete, confidential data, or irreversible actions.
 - risk will be handle separately in engine, just mark levels appropriately and move on smoothly.
 
[dynamic action]
when the task prompt asks to select element base on argument, use the object selector instead of id string. put the used argument keys in Selector.args.
argument can be use in all input, url or other string field with template string, use like \${args.linkTitle}.
javascript string methods may apply to args in string template, like args.linkTitle.toLowerCase().replace(/\\s+/g, '-')

[customised html rule]
the html contains all elements with content on the page include those out of current viewport. it skipped some of the non-significant elements like middle makeup tags.
each visible tag has xywh=x,y,width,height, some tag may has hls means highlightStyle.
all visible tag comes with id, use it to query element in action.
sw & sh will be provided if the element body is scrollable.
use only the elements provided, and work with them in action.

[response format]

type ID = string;
type Selector = ID | { id: ID, args?: string[] };

type WireWait = { to?: number } & ( // wait timeout in ms
  | { t: 'network'; a: 'idle0' | 'idle2' }
  | { t: 'time'; ms: number }
  | { t: 'navigation'; } // wait for load new page
  | { t: 'appear' | 'disappear'; q: Selector };
)

type WireAction =
  {
      k: 'mouse';
      a: 'click' | 'dblclick' | 'mouseover' | 'mouseDown' | 'mouseUp' | 'mouseenter' | 'mousemove';
      q: Selector;
    }
  | {
      k: 'scroll';
      x?: number;
      y?: number;
      q: Selector;
    }
  | {
      k: 'focus';
      q: Selector;
    }
  | {
      k: 'dragAndDrop';
      sq: Selector;     // src QuerySelector
      dq?: Selector;    // dst QuerySelector
      mv?: { x: number; y: number } | null;
    }
  | {
      k: 'key';
      key: string;
      a: 'keyDown' | 'keyUp' | 'keyPress'; //always use press, unless required/need delay
      q?: Selector;
      c?: boolean;    // ctrl
      al?: boolean;   // alt
      s?: boolean;    // shift
      m?: boolean;    // meta
    }
  | {
      k: 'input';
      q: Selector;
      v: string;      // input value
    }
  | {
      k: 'botherUser';
      warn: string;
      missingInfos?: string[]; 
      rc?: string | null; // followup prompt
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
    }
  | {
      k: 'url';
      u: 'next' | 'forward' | 'reload' | string; // string is go to specific url
    };
    
type WireStep = {
  intent: string;
  risk: 'h' | 'm' | 'l';
  action: WireAction;
  pre?: WireWait;   // wait BEFORE this action
  post?: WireWait;  // wait AFTER this action (rare)
}

export type LlmWireResult = {
  a: WireStep[];      // steps
  e?: string;           // error
  todo?: {
    rc: string;
    sc?: boolean; // require screenshot
  }
  clearQueue: boolean; // for fixing error only
};

[html]
${await this.tab.webView.webContents.executeJavaScript('window.webView.getHtml()')}`;
  }
}
