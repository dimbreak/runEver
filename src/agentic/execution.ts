import fs from 'fs/promises';
import {
  type ExecutorLlmResult,
  ExecutorLlmResultSchema,
  RiskOrComplexityLevel,
  WireActionOrSubTaskSchema,
  WireActionWithWait,
  WireSubTask,
} from './execution.schema';
import { LlmApi } from './api';
import {
  JsonStreamingEvent,
  JsonStreamingEventType,
  JsonStreamingParser,
} from '../main/llm/jsonStreamer';
import { Profile } from './profile/profile';
import './profile/registry';
import { WebViewLlmSession } from './webviewLlmSession';

const ComplexityToModelConfig: Record<
  RiskOrComplexityLevel,
  [LlmApi.LlmModelType, LlmApi.ReasoningEffort]
> = {
  l: ['mid', 'low'],
  m: ['mid', 'medium'],
  h: ['mid', 'medium'],
};

const userPromptRules = `[every request]
- [goal] will be in absolute priority, while [mission] sometimes given for specific task to archive the goal. stop once the goal is done & ignore mission.
- [goal] or [mission] could be very long, make taskEstimate in very short natual language. Then check
  - when the goal/mission has task not have absolute confident to do in current HTML, put in todo only; 
  - if the task doable in CURRENT HTML is long, say > 3 actions, consider split into subtasks.
  - give actions to work directly.
- [performed actions] will provided in followup prompts, take what have been done into account to avoid duplication, just do the new actions.
- Updated UI state is always provide by the [html].
- take [html] as source of truth or verification, not rely on arguments.
- setArg is used only for **carry context over page navigations & returning result to user**, not verify or read data.
- the context required in next step should be provided by [html] or todo, setArg is only used for carry over the whole session or return result to user.
- ask yourself 3 questions before setArg, unnecessary arguments consider expensive and confusing, you need at least 1 exact yes answer to perform it:
  - if the value will disappear from html after your actions and required by downstream(remember they have [html]) or
  - if the goal ask to return/send the value explicitly(not over interpret) or
  - if the value is required by the subtask you created
- when asked to verify result, **ONLY USE [html]** to check against expected value
- when the argument value is coming from attachment, add filename to the key, like invoice.pdf-total.
- when receive attachment without description in readable file list other than screenshot.jpg, use todo.descAttachment to shortly describe the file content for giving context to downstream
- file from download action can use immediately in todo, just put the same filename in attach and download action.
- file should only be read on demand, and store necessary info in argument, do not require reading in every todo.

[safty check]
- links to external origin will give href, **MUST CHECK the url before click**, make sure matches its description. fraud is common in search engines or sns.
- **YOU MUST AVOID all kind of imagination official domain**, like amason.com, herms.co, apple.dev etc, especially looking to shop / transaction unless the goal override it.

[subtask guide]
- plan sub tasks for **current page & current tab & current visible ui show in HTML only**, each sub task **MUST BE created base on >1 current visible UI**.
- tasks in shouldGoTodo never put in subtask.
- prioritise [goal] preference, skip splitting if it explicitly say do not add subtask.
- MUST create subtask if [goal] or [mission] doable in current HTML falls into one of the following criteria even marginally:
  - dealing with long task more than 5 steps, typically filling form with > 3 field or,
  - interact with calendar, tree menu, combobox, tags picker or other complex/uncertain widget MUST BE operate in their own subtask. Isolate them from other tasks.
- the final irreversible step MUST BE in todo of the main task, perform after all subtasks done, MUST ADD TODO if sub task is created, left >1 steps in todo.
- sub task prompt must be in short(<20 words) natual language and argument key with delegated task working with **mostly 3 current visible UI elements only**.
- **Subtask prompt is atomic task UNDER CURRENT STATUS**, do only what you found in HTML absolutely no prediction of status changes.
- DO NOT GIVE actions, give only high level task WORKABLE ON CURRENT VISIBLE UI IN HTML, let the subtask executor to decide actions.
- not supporting nested subtask, if you found current subtask should be split, end the current subtask and make advise with subtaskResp, let root executor create new subtasks.
- use arguments to communicate between main & sub tasks, arguments shared across the whole session. **provide arguments to subtask whenever you can with plain text or argument tpl only**.
- full set of current arguments will pass to subtask, reset is not necessary.
- WireSubTaskDoableInCurrentHtml MUST NOT mix with WireStep, only one type of elements are allowed in a response.
- only create subtask on non-subtask, response only actions and todo when [this is a sub task] appear.
- estimate the complexity of sub task and h=high, m=medium, l=low, a complex task may contain more actions or uncertain reactions from UI need attempts to get it done. it will give more reasoning power or better model.
   - typically low means obvious task like click a button, fill a input etc.
   - mid means multiple step action like picking select/dropdown, filling multiple fields, submit form etc.
   - high means dealing with most complex or uncertain ui like calendar, tree menu, drag and drop etc.

[action guide]
- user task prompt may contain task work across multiple pages. You only plan actions doable in **the current content found in [html]**.
- every action need to be able to connect with **at least one element** in [html] provided, otherwise it is invalid.
- when task cannot be continue with current info, try perform possible actions and put followup prompt in todo. content may appear after that and it will resent after page state changed automatically with page updates.
- limit actions to 5 in one batch of response to avoid losing focus, it may even be fewer if the action is in high risk, put the remaining in todo or split into subtasks.
- some action like mouse click and key press can repeat multiple times by setting repeat, interval will be set by engine. perfer repeat over sending multiple actions.
- All actions operate only on the currently visible page content by default. Searching, or navigating for extra is not allowed unless the task explicitly asks for it.
- Destructive actions must be bound to a visible UI element.Keyboard shortcuts are not allowed for delete/remove unless explicitly requested by the task or stated on the UI.
- For multiple fields form, submit action must appear as an isolated response with single action. put in todo and remind next executor to verify input and do submit if inputs are valid.
- set pre/post hook ONLY IF it is **required by the workflow**. ordinary waiting or rerender/reload event will be handled by engine.
- wait domLongTime is for async event ONLY, like wait for message, email, llm stream response.

- you should:
- focus on the [mission] if exist while not conflict with the [goal], use [performed actions] to determine the current status in task.
- explain intention in WireStep.intent with very short natual language & argument before action, like \\"click the submit button\\", \\"fill in user name with $args.username\\" etc
- always mention argument & key in intention if they involved in the element lookup or action.
- read value and verify result by looking at [html], browser actions cannot help unless you need trigger some specific event to reveal values.
- assign a risk level to each step
- assume the url is opened and perform task on current page.
- you may return result by setting argument.
- provide key actions. browser engine will trigger pre-required action if possible, like focus before input, scroll and mouse move before click etc.
- prefer submit form with enter key over click button if input/focused on form element in previous step.
- only use todo.sc in case of the html does not make much sense on task prompt, like many of media tags without alt/title.
- only apply LlmWireResult.clearQueue when fixing error.
- focus on [mission] or [action error] if they appear in task prompt if they align with the [goa].
- **only botherUser when the task is really uncertain or impossible** to be done, like missing info, large amount of transactions. Uncertainty alone is NOT a reason to bother user.

- Irreversible or high-impact actions (e.g. submitting critical forms, confirming payments, deleting data):
   - Do NOT use trial and error.
   - Only perform them when the outcome is clear and verified.
   - If required information is missing or the outcome is uncertain, use botherUser.
   - mark as high risk.

- Reversible or non-critical actions (e.g. navigation, opening widgets, clicking controls, changing views):
   - You MUST attempt a reasonable action and observe the result.
   - Perform at most one exploratory attempt per control. Decide using the lowest-risk option.
   - Always trial with one single step if uncertain and mention it in todo, like \\"The current state is X, I have tried click Y buttom, see how it behaves and decide the next towards the goal.\\".
   - Observe what changed. Use the result of the attempt to decide the next step.
   - If the result clarifies the behavior, continue.
   - Engine will bother user after hard limit of attempts reached.
   - Escalate to botherUser only as a last resort.

- todo rules:
- todo is for reminding next executor in next request, keep it in similar wording & arguments from original prompt.
- todo will only run when all action & subtask done, and what has been done will provided in header prompt, **ONLY mention what is left on the goal in todo**.
- page state will be updated and resend together with the performed actions, avoid mentioning in todo to confuse next executor.
- let next executor decide the action detail, only give high level mission.
- if argument is in use, always mention the key instead of value.
- write todo base on assumption that all waiting and action has been done, tell the next executor what to do directly without ask for waiting.
- require screenshot is expensive, ONLY when the necessary info is likely only appear on media(canvas, svg, img etc), or the html layout is not making much sense.
- [goal] will be sent in every prompt, do not repeat in todo.

- risk levels:
- risk = 'l' | 'm' | 'h' - 'l' (low) = scroll, click navigation link/button, mouse over, simple search, open page
- 'm' (mid) = fill form fields, drag & drop, submit data
- 'h' (high) = delete/remove, payment/checkout, irreversible settings, sensitive data operations
- always prioritise caution if user prompt mentions danger, careful, payment, delete, confidential data, or irreversible actions.
- risk will be handle separately in engine, just mark levels appropriately and move on smoothly.

[dynamic action]
when you use any key from arguments for element lookup, like html or label contains certain argument.key, which may appeared in WireStep.intent, you must **put the used argument keys in Selector.argKeys**. otherwise put empty array.
argument can be use in all input, url or other **string field** with template string, use like \${args.linkTitle}, make sure args is use within string template.
javascript string methods may apply to args in string template, like args.linkTitle.toLowerCase().replace(/s+/g, '-')
the only legal string format are plain text and args string template **start with '\${args.'** like \${args.linkTitle}, js code other than these will cause error.
  use argument tpl in number or object field cause error, covert to other format on your own and use as hardcode if necessary.

`;

export class ExecutionPrompter {
  runner: Promise<ReturnType<typeof LlmApi.queryLLMSession>> | undefined;
  requestInSession = 0;
  constructor(private tabManager: WebViewLlmSession) {}
  getRunner() {
    console.info('getRunner', this.runner);
    if (!this.runner) {
      // delta too long, reset system prompt
      this.runner = new Promise(async (resolve) => {
        console.log('Executor runner init');
        resolve(
          LlmApi.queryLLMSession(
            (
              await Profile.process('execution', {
                system: this.buildSystemPrompt(),
              })
            ).system!,
            'executor_',
          ),
        );
      });
      console.info('this.runner:', this.runner);
    }
    return this.runner;
  }
  async *execPrompt(
    goalPrompt: string,
    args: Record<string, string> = {},
    subPrompt: string | undefined = undefined,
    requireScreenshot = false,
    complexity: RiskOrComplexityLevel = 'l',
    extraAttachments: string[] = [],
    retry = 0,
  ): AsyncGenerator<
    WireActionWithWait | WireSubTask,
    ExecutorLlmResult | undefined,
    void
  > {
    const { tabManager } = this;
    const tab = tabManager.getFocusedTab()!;
    const { webView: wv } = tab;
    const rect = wv.getBounds();
    console.log('Executor execPrompt', wv.webContents.id);
    const fullHtml = (await wv.webContents.executeJavaScript(
      'window.webView.getHtml()',
    )) as string;
    console.info('fullHtml length:', fullHtml.length);
    const runner = await this.getRunner();
    console.info('runner:', runner);
    const readableFiles = Array.from(tabManager.readableFiles.keys());
    const modelCfg = ComplexityToModelConfig[complexity];
    const promptParts = await Profile.process('execution', {
      goal: goalPrompt,
      sub: subPrompt,
      userHeader: `[url]
${wv.webContents.getURL()}${
        tabManager.tabsCount() > 1
          ? `

[opened tabs]
${tabManager
  .listTabs()
  .map(
    (t) =>
      `${t.id}:${t.title ? `[${t.title}] ${t.url}` : t.url}${t.focused ? ' focus' : ''}`,
  )
  .join('\n')}`
          : ''
      }

[viewport]
w=${rect.width} h=${rect.height}

[html]
${fullHtml}${
        readableFiles.length
          ? `

[readable file]
- ${Array.from(tabManager.readableFiles.values()).map(
              (k) =>
                `${extraAttachments.includes(k.name) ? 'attached ' : ''}${k.name}: ${k.mimeType}${k.desc ? ` desc from previous read:${k.desc}` : ''}`,
            ).join(`
- `)}
**can attach with todo.readFiles**`
          : ''
      }

[argument keys]
${
  args && Object.keys(args).length
    ? Object.entries(args)
        .map((arg) => `${arg[0]}: ${arg[1]}`)
        .join('\n')
    : '(no keys)'
}`,
    });
    const runPrompt = `${userPromptRules}

${promptParts.userHeader}

[goal]
${promptParts.goal}${promptParts.sub ? `\n[mission]\n${promptParts.sub}` : ''}`;
    const attachments: LlmApi.Attachment[] = [];
    if (requireScreenshot) {
      attachments.push({
        type: 'image',
        image: (await tab.screenshot()).toJPEG(80),
        mediaType: 'image/jpeg',
      });
    }
    if (extraAttachments.length) {
      for (const f of extraAttachments) {
        const file = tabManager.readableFiles.get(f);
        if (file) {
          if (!file.data) {
            try {
              file.data = await fs.readFile(file.path!);
            } catch (e) {
              console.error('Failed to read file', file.path, e);
            }
          }
          if (file.data) {
            if (file.mimeType.startsWith('image/')) {
              attachments.push({
                type: 'image',
                image: file.data,
                mediaType: file.mimeType,
              });
            } else {
              attachments.push({
                type: 'file',
                data: file.data,
                mediaType: file.mimeType,
              });
            }
          }
        }
      }
    }
    console.log(
      '------------------------------------------\nExecutor runner prompt:',
      `${promptParts.userHeader}

[goal]
${promptParts.goal}${promptParts.sub ? `\n[mission]\n${promptParts.sub}` : ''}`,
    );
    let actionStage = 0;
    let events: JsonStreamingEvent[];
    let event: JsonStreamingEvent;
    let hasError = false;
    let parsedReturn;
    const jsonParser = new JsonStreamingParser(true);
    try {
      const stream = runner(runPrompt, attachments, modelCfg[0], modelCfg[1]);
      this.requestInSession++;
      for await (const chunk of stream) {
        events = jsonParser.push(chunk);
        if (!hasError) {
          for (event of events) {
            if (event.type === JsonStreamingEventType.Error) {
              console.error('parse error', event);
              hasError = true;
              break;
            }
            if (event.type === JsonStreamingEventType.Array) {
              if (event.key === 'a') {
                actionStage++;
              }
            } else if (
              event.type === JsonStreamingEventType.Object &&
              event.endValue
            ) {
              if (actionStage === 1 && typeof event.key === 'number') {
                const step = WireActionOrSubTaskSchema.safeParse(
                  event.endValue,
                );
                if (step.success) {
                  yield step.data;
                } else {
                  console.warn('Exec step error:', step.error);
                }
              } else if (event.key === null) {
                console.log('Exec result end');
                parsedReturn = event.endValue;
              }
            }
          }
        }
      }
      if (parsedReturn === undefined) {
        const endRes = jsonParser.readAll();
        console.log('Exec end no result', endRes);
        parsedReturn = JSON.parse(endRes);
      }
    } catch (e) {
      console.log('Exec error', e);
    }
    const jsonRes = ExecutorLlmResultSchema.safeParse(parsedReturn ?? {});
    console.log('Exec result:', jsonRes);
    if (jsonRes.success) {
      return {
        ...jsonRes.data,
        todo:
          jsonRes.data.todo === 'finishedNoToDo'
            ? undefined
            : jsonRes.data.todo,
      };
    }
    console.log('Retry execPrompt', retry);
    if (actionStage === 0 && retry < 3) {
      return yield* this.execPrompt(
        goalPrompt,
        args,
        subPrompt,
        requireScreenshot,
        complexity,
        extraAttachments,
        retry + 1,
      );
    }
    throw new Error('Exec end error');
  }

  resetSystemPrompt() {
    this.requestInSession = 0;
    // this.runner = undefined;
  }
  // | { t: 'domLongTime'; a: 'any'|'childAdd'|'childRm'|'attr'|'txt'; q: Selector;} // only for waiting async event, like message, email, llm stream response.
  buildSystemPrompt() {
    // | { t: 'navigation'; } // wait for load new page
    // | { t: 'appear' | 'disappear'; q: Selector }
    const responseType = `
type ID = string;
type Selector = ID | { id: ID, argKeys: (string|null)[] };

type WireWait = { to?: number } & ( // wait timeout in ms
  | { t: 'network'; a: 'idle0' | 'idle2' }
  | { t: 'time'; ms: number }
)

type WireAction =
  {
      k: 'mouse';
      a: 'click' | 'dblclick' | 'mouseover' | 'mouseDown' | 'mouseUp' | 'mouseenter' | 'mousemove';
      q: Selector;
      repeat?: number;
    }
  | {
      k: 'scroll';
      to: Selector | [number/*x*/, number/*y*/];
      over?: Selector; // default to window
    }
  | {
      k: 'focus';
      q: Selector;
    }
  | {
      k: 'dragAndDrop';
      sq: Selector; // src QuerySelector
      dq?: Selector; // dst QuerySelector
      mv?: { x: number; y: number } | null;
    }
  | {
      k: 'key';
      key: string;
      a: 'keyDown' | 'keyUp' | 'keyPress'; //always use press for typing, unless required/need delay
      q?: Selector;
      c?: boolean; // ctrl
      al?: boolean; // alt
      s?: boolean; // shift
      m?: boolean; // meta
      repeat?: number;
    }
  | {
      k: 'input'; // for input, textarea, select, also upload file with path in v
      q: Selector;
      v: string|string[]; // input value, array for multiple select/files
    }
  | {
      k: 'botherUser';
      warn: string;
      missingInfos?: string[];
      rc?: string | null; // followup prompt
    }
  | {
      k: 'setArg';
      answer3Questions: string; // keep short
      // key value pair
      kv: Record<string, string | {q: Selector, attr?: string}>; //str value or from element
    }
  | {
      k: 'url';
      u: 'next' | 'forward' | 'reload' | string; // string is go to specific url
    }
  | {
      k: 'tab';
      id: number; // switch to id, -1 = new
      url?: string; // go to url on switch
    }
  | {
      k: 'selectTxt';
      q: Selector;
      txt: string;
    }
  | {
      k: 'download';
      a: Selector;
      t: 'link' | 'img' | 'bg-img'; // what to download
      filename?: string; // filename to read in downstream
    }
  | {
      k: 'screenshot';
      filename: string; //png
      a?: Selector;
    };

type WireStep = {
  intent: string;
  risk: 'h' | 'm' | 'l';
  action: WireAction;
  pre?: WireWait; // wait BEFORE this action, most of the time engine can handle it automatically
  post?: WireWait; // wait AFTER this action, most of the time engine can handle it automatically
}

type WireSubTaskDoableInCurrentHtml = {
  baseOnUi: Selector;
  subTaskPrompt: string;
  addArgs?: Record<string, string>; // plain text or string template with args only
  complexity: 'h' | 'm' | 'l';
}

type AttachementDesc = {
  name: string;
  desc: string;
};

type LlmWireResult = {
  taskEstimate: {
    doableInCurrentHtml: string;
    shouldGoTodo: string;
  };
  a: WireSubTaskDoableInCurrentHtml[] | WireStep[]; // steps or sub tasks, no mix
  e?: string; // error
  todo: {
    sc?: boolean; // require screenshot
    rc: string; // after all prompt
    readFiles?: string[]; // attach readable files
    descAttachment?: AttachementDesc[];
  } | 'finishedNoToDo';
  subtaskResp?: 'done' | string;
};`;
    return `[system]
a web base agentic workflow task engine, perform action in agent browser according to pre-processed task guide.

[role]
you are an executor, working on task with web page. taking user tasks in prompt [goal] section and compile into actions or subtask to perform on the browser.
you are responsible for give actions, verify result inside the reasoning process on your own.

[customised html rule]
the html contains all elements with content on the page include those out of current viewport. it skipped some of the non-significant elements like middle makeup tags.
each visible tag has xywh=x,y,width,height, some tag may has hls means highlightStyle.
all visible tag comes with id, use it to query element in action. it is dynamical generated by engine, may change if element moved or removed in dynamic ui. avoid delegate id in todo.
sw & sh will be provided if the element body is scrollable.
val is the value of input, select, textarea.
use only the elements provided in current [html], and work with their id in action. make sure the id you use appear in current [html], cached [html] in previous session may have expired.

[response in valid json format]
${responseType}

**only valid JSON response is acceptable, markdown code block quoting will cause error**`;
  }

  /*
[html]
${await this.tab.webView.webContents.executeJavaScript('window.webView.getHtml()')}
   */
}
