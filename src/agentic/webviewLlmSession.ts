import { app, BrowserWindow, Rectangle } from 'electron';
import fs from 'fs';
import { TabWebView } from '../main/webView/tab';
import { LlmApi } from './api';
import { PromptRun } from './promptRun';
import { WireActionWithWaitAndRec } from './types';
import { ToRendererIpc } from '../contracts/toRenderer';
import { Util } from '../webView/util';
import { PromptAttachment } from '../schema/attachments';
import { WireTabAction } from './execution.schema';
import { CommonUtil } from '../utils/common';
// import { CommonUtil } from '../utils/common';

const DEBUG_CONFIRM_ALL_ACTIONS = false;
const testPrompt: { user: string; system: string } | null = {
  user: `[every request]
- [goal] will be in absolute priority, while [mission] sometimes given for specific task to archive the goal. stop once the goal is done & ignore mission.
- [goal] or [mission] could be very long, make taskEstimate in very short natual language < 20 words. Then check
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
- file should only be read on demand, and store necessary info in argument, do not re-read unless really necessary.

[safty check]
- links to external origin will give href, **MUST CHECK the url before click**, make sure matches its description. fraud is common in search engines or sns.
- **YOU MUST AVOID all kind of imagination official domain**, like amason.com, herms.co, apple.dev etc, especially looking to shop / transaction unless the goal override it.

[subtask guide]
- plan sub tasks for **current page & current tab & current visible ui show in HTML only**, each sub task **MUST BE created base on >1 current visible UI**.
- tasks in shouldGoTodo never put in subtask.
- no support for nested subtask, you must end the current subtask and make advise with requireRearrangeSubtask if you are running subtask but found current subtask should be split.
- prioritise [goal] preference, skip splitting if it explicitly say do not add subtask.
- MUST create subtask if [goal] or [mission] doable in current HTML falls into one of the following criteria even marginally:
  - dealing with long task more than 5 steps, typically filling form with > 3 field or,
  - interact with calendar, tree menu, combobox, tags picker or other complex/uncertain widget MUST BE operate in their own subtask. Isolate them from other tasks.
- the final irreversible step MUST BE in todo of the main task, perform after all subtasks done, MUST ADD TODO if sub task is created, left >1 steps in todo.
- sub task prompt must be in short(<20 words) natual language and argument key with delegated task working with **mostly 3 current visible UI elements only**.
- **Subtask prompt is atomic task UNDER CURRENT STATUS**, do only what you found in HTML absolutely no prediction of status changes.
- DO NOT GIVE actions, give only high level task WORKABLE ON CURRENT VISIBLE UI IN HTML, let the subtask executor to decide actions.
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

[url]
runever://benchmark/#/im

[viewport]
w=1699 h=916

[html]
<script>const font = {"ff0":"\\"Fira Sans\\", \\"Gill Sans\\", \\"Trebuchet MS\\", sans-serif","ff1":"-apple-system, BlinkMacSystemFont, \\"Segoe UI\\", Roboto, Helvetica, Arial, sans-serif"};
  const hls = {"#0":"600 16px / 24px ff1 #000","#1":"12px / 18px ff1 #888","#2":"14px / 21px ff1 #888","#3":"12px / 18px ff1 #fff","#4":"14px / 21px ff1 #fff","#5":"16px / 24px ff1 #000","#6":"20px / 30px ff1 #777","#7":"15px / 22.5px ff1 #000","#8":"24px / 36px ff1 #39e","#9":"11px / 15.4px ff1 #5b6","#10":"11px / 15.4px ff1 #aab","#11":"600 16px / 24px ff1 #fff","#12":"12px / 18px ff1 #cef","#13":"14px / 21px ff1 #cef","#14":"13px / 19.5px ff1 #888","#15":"15px / 21px ff1 #000","#16":"16px / 24px ff1 #fff","#17":"500 15px
/ 21px ff1 #000"};</script><div id=__10 xywh=170,24,1359,733 hls=5><div id=__1h xywh=490,93,1039,597 sh=760><div outOfDoc><div>Please confirm order 123.</div><span>09:00</span></div><div covered><div>Looks good to me</div><span>09:15</span></div><div id=__1d xywh=1321,83,171,58 hls=15><div id=__1b xywh=1333,91,147,21>Thank you, will submit</div><span id=__1c xywh=1454,118,26,15 hls=9>09:15</span></div><div id=__1g xywh=510,149,139,58 hls=15><div id=__1e xywh=522,157,115,21>You are welcome.</div><span id=__1f xywh=611,184,26,15
hls=10>09:16</span></div><div id=__1p xywh=1054,216,438,63 hls=15><div id=__1n xywh=1066,224,414,21 hls=17>runever_upload_1769645770543_sample_order_form-1.pdf</div><span id=__1o xywh=1432,256,48,15 hls=9>12:16</span></div><div id=__1s xywh=1335,287,158,242 hls=15><img id=__1q label=attachment xywh=1347,295,134,200 /><span id=__1r xywh=1432,506,48,15 hls=9>12:16</span></div><div id=__1v xywh=915,537,578,58 hls=15><div id=__1t xywh=927,545,554,21>Hi Dillion — I’ve attached the image and the purchase order. Please confirm
receipt.</div><span id=__1u xywh=1432,572,48,15 hls=9>12:16</span></div><div id=__1y xywh=510,604,625,58 hls=15><div id=__1w xywh=522,612,601,21>Looks good to me, but could you put in remark say the client is vip. then that's good to go.</div><span id=__1x xywh=1075,639,48,15 hls=10>12:16</span></div></div><div id=__1m xywh=490,690,1039,67><button id=__1i xywh=510,711,36,26 hls=6 /><input id=__1j xywh=0,0,0,0 val= type=file /><input id=__1k xywh=556,700,907,47 val= placeholder="Write a message..." hls=7 /><button id=__1l
xywh=1473,705,36,38 hls=8 /></div><div id=__y xywh=170,24,320,733><input id=__0 xywh=180,34,299,42 val= placeholder=Search /><div id=__x xywh=170,86,319,671><div id=__7 xywh=170,86,319,70 hls=16><img id=__1 label="Manager Dillion" xywh=180,96,50,50 /><div id=__6 xywh=240,96,239,50><div id=__4 xywh=240,97,239,24><span id=__2 xywh=240,97,116,24 hls=11>Manager Dillion</span><span id=__3 xywh=426,97,52,24 hls=12>12:16</span></div><span id=__5 xywh=240,125,180,21 hls=13>Looks good to me, but could you put in remark say the client
 is vip. then that's good to go.</span></div></div><div id=__g xywh=170,156,319,70><img id=__8 label="Pavel Durov" xywh=180,166,50,50 /><div id=__f xywh=240,166,239,50><div id=__b xywh=240,167,239,24><span id=__9 xywh=240,167,87,24 hls=0>Pavel Durov</span><span id=__a xywh=450,167,28,24 hls=1>12:30</span></div><div id=__e xywh=240,195,239,21><span id=__c xywh=240,195,173,21 hls=2>Check out the new features!</span><span id=__d xywh=459,196,20,18 hls=3>2</span></div></div></div><div id=__n xywh=170,226,319,70><img id=__h
 label="React Developers" xywh=180,236,50,50 /><div id=__m xywh=240,236,239,50><div id=__k xywh=240,237,239,24><span id=__i xywh=240,237,125,24 hls=0>React Developers</span><span id=__j xywh=450,237,28,24 hls=1>11:15</span></div><span id=__l xywh=240,265,180,21 hls=2>Anyone know how to use hooks?</span></div></div><div id=__w xywh=170,296,319,70><img id=__o label="Family Content" xywh=180,306,50,50 /><div id=__v xywh=240,306,239,50><div id=__r xywh=240,307,239,24><span id=__p xywh=240,307,109,24 hls=0>Family Content</span><span id=__q xywh=428,307,50,24 hls=1>Yesterday</span></div><div id=__u xywh=240,335,239,21><span id=__s xywh=240,335,75,21 hls=2>Dinner at 7?</span><span id=__t xywh=459,336,20,18 hls=3>5</span></div></div></div></div></div><div id=__z xywh=490,24,1039,69><div id=__14 xywh=510,34,116,48><span id=__12 xywh=510,34,116,24 hls=0>Manager Dillion</span><span id=__13 xywh=510,62,99,17 hls=14>last seen recently</span></div></div></div> //17

[readable file]
- de583adbfdd8e235c08ae17c8db9e-04.jpg: image/jpeg desc from previous read:Attached user-provided image (photo).
- sample_order_form-1.pdf: application/pdf desc from previous read:Attached purchase order PDF (contains order PO-1040, total $2060.00).
**can attach with todo.readFiles, note read file is expensive attach when necessary**

[messager guide]
- in session container, if not indicated per message, left side is the session targets message, right side is users. **latest messages are at the bottom**,
- if not specific prompt, get message means last one from prompted sender.
- waitMsg should only use at the very beginning or after triggering action, like send message and wait reply, **no other action should add after waitMsg**.
- if the last preformed action say waited, that means wait finished and you should check messages in HTML
- **MUST SET CURRENT LAST MESSAGE ID IN ARG BEFORE waitMsg**, then compare the HTML with last id in argument to identify new messages

[argument keys]
jpg: de583adbfdd8e235c08ae17c8db9e-04.jpg
pdf: sample_order_form-1.pdf
lastMsgId: __1e

[file upload guide]
- using input action to upload, put readable file name in the value
- allow operate hidden input type=file
- if user said attach/upload in goal, do not botherUser

[contentEditable RTE guide]
- use toolbar for makeups
- HTML can only be use when it comes with html mode

[goal]
send this two files to dillion and ask him to confirm, wait for his reply then say thank you, copy his reply to Pavel

[attachments]
- de583adbfdd8e235c08ae17c8db9e-04.jpg (image/jpeg, 120.1 KB)

Use the attached images for this prompt; do not ask the user to upload images unless absolutely required.
[mission]
**todo from last executor maybe outdated as page state changed, stick to the [goal] and current [HTML] page status**
After Dillion replies (new message appears in the chat): 1) send him 'Thank you.' 2) copy Dillion's latest reply text into args.dillion_reply (capture the new message text). 3) open Pavel's chat (click the Pavel chat row) and paste args.dillion_reply into the message box, then send. Verify each send is delivered.

[performed actions]
- open Manager Dillion chat by clicking the chat row
- store attachment filenames for use after navigation: keys jpg and pdf
- attach files \${args.jpg} and \${args.pdf}
- fill message with 'Hi Dillion — I’ve attached the image and the purchase order. Please confirm receipt.'
- click send button and wait for Dillion reply

`,
  system: `[system]
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
      key: string; // single key, use input for typing words
      a: 'keyDown' | 'keyUp' | 'keyPress'; //always use press for typing, unless required/need delay
      q?: Selector;
      c?: boolean; // ctrl
      al?: boolean; // alt
      s?: boolean; // shift
      m?: boolean; // meta
      repeat?: number;
    }
  | {
      k: 'input'; // for input, textarea, contentEditable, select, also upload file with path in v
      q: Selector;
      v: string|string[]; // input value, array for multiple select/files
      c?: 'noClear'; // without this will clear before typing
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
  pre?: WireWait // wait BEFORE this action, most of the time engine can handle it automatically
  post?: WireWait | // wait AFTER this action, most of the time engine can handle it automatically
   { t: 'waitMsg'; // wait for email, messager session dom update, **MUST NOT ADD ACTION AFTER THIS**
     q: Selector; // dialog container, email list etc
   }
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
    readFiles?: string[]; // attach readable files only when you really need the content in file
    descAttachment?: AttachementDesc[];
  } | 'finishedNoToDo';
  subtaskResp?: 'done' | string;
};

**only valid JSON response is acceptable, markdown code block quoting will cause error**`,
};

export class WebViewLlmSession {
  private static readonly PADDING = 0;
  private static readonly DEFAULT_TABBAR_HEIGHT = 112;
  private static readonly DEFAULT_SIDEBAR_WIDTH = 430;

  public readableFiles: Map<string, PromptAttachment> = new Map();
  private runsByRequestId = new Map<number, PromptRun>();
  private runQueue: number[] = [];
  private activeRequestId: number | null = null;
  private inFlightAction = false;
  private actionIdToRequestId = new Map<number, number>();
  private nextActionId = 0;
  private lastStartedRequestId: number | null = null;
  private snapshotTimer: NodeJS.Timeout | null = null;
  private snapshotPending = false;
  private tabsById = new Map<number, TabWebView>();
  private focusedTab: TabWebView | null = null;
  private userInputResolvers = new Map<
    number,
    (answer: Record<string, string>) => void
  >();

  constructor(private mainWindow: BrowserWindow) {}

  registerTab(tab: TabWebView) {
    this.tabsById.set(tab.webView.webContents.id, tab);
    if (tab.bounds.width > 0 && tab.bounds.height > 0) {
      tab.focus();
      this.runsByRequestId
        .get(this.lastStartedRequestId ?? -1)
        ?.runningSession[0]?.addLog(
          `Populated tab and focused [${tab.webView.webContents.getTitle()}]`,
        );
    }
  }

  unregisterTab(frameId: number) {
    this.tabsById.delete(frameId);
  }

  getTab(frameId: number) {
    return this.tabsById.get(frameId);
  }

  getAnyTab() {
    return this.tabsById.values().next().value as TabWebView | undefined;
  }

  getTabsById() {
    return this.tabsById;
  }

  isFocused(tab: TabWebView) {
    return this.focusedTab === tab;
  }

  focusTab(tab: TabWebView) {
    if (this.focusedTab && this.focusedTab !== tab) {
      this.focusedTab.blur();
    }
    this.focusedTab = tab;
  }

  getFocusedTab() {
    return this.focusedTab;
  }

  getSafeBounds(
    opts: {
      sidebarWidth?: number;
      tabbarHeight?: number;
      viewportWidth?: number;
    } = {},
  ) {
    const sidebarWidth =
      opts.sidebarWidth ?? WebViewLlmSession.DEFAULT_SIDEBAR_WIDTH;
    const tabbarHeight =
      opts.tabbarHeight ?? WebViewLlmSession.DEFAULT_TABBAR_HEIGHT;

    const win = this.mainWindow?.getBounds();
    const devtoolsWidth = (win?.width ?? 1024) - (opts.viewportWidth ?? 0);
    const width = Math.max(
      320,
      (win?.width ?? 1024) -
        sidebarWidth -
        devtoolsWidth -
        WebViewLlmSession.PADDING * 2,
    );
    const height = Math.max(
      320,
      (win?.height ?? 728) - tabbarHeight - WebViewLlmSession.PADDING * 2,
    );
    return {
      x: WebViewLlmSession.PADDING,
      y: tabbarHeight + WebViewLlmSession.PADDING,
      width,
      height,
    };
  }

  createTab(detail: { url: string; bounds?: Rectangle }) {
    const bounds = detail.bounds ?? this.getSafeBounds();
    const wvTab = new TabWebView(detail.url, bounds, this.mainWindow, this);
    const frameId = wvTab.webView.webContents.id;
    wvTab.webView.webContents.once('destroyed', () => this.cleanupTab(frameId));
    wvTab.webView.webContents.on('render-process-gone', () =>
      this.cleanupTab(frameId),
    );
    this.mainWindow?.contentView.addChildView(wvTab.webView);
    this.registerTab(wvTab);
    return { id: frameId };
  }

  async operateTab(detail: {
    id: number;
    bounds?: Rectangle;
    url?: string;
    viewportWidth?: number;
    exeScript?: string;
    close?: boolean;
    visible?: boolean;
    sidebarWidth?: number;
    tabbarHeight?: number;
  }) {
    const frameId = detail.id;
    const wvTab = this.getTab(frameId);
    if (!wvTab) return { error: 'Tab not found' };
    let response;
    if (detail.close) {
      // Ensure any in-flight prompt/task is stopped before destroying webContents.
      wvTab.stopPrompt();
      wvTab.webView.setVisible(false);
      this.mainWindow?.contentView.removeChildView(wvTab.webView);
      this.unregisterTab(frameId);
      if (!wvTab.webView.webContents.isDestroyed()) {
        wvTab.webView.webContents.close();
      }
      response = 'closed';
    } else {
      if (detail.visible !== undefined) {
        wvTab.webView.setVisible(detail.visible);
        if (detail.visible) {
          wvTab.focus();
        }
      }
      if (detail.bounds) {
        wvTab.webView.setBounds(detail.bounds);
      } else if (!detail.url && !detail.exeScript) {
        wvTab.webView.setBounds(
          this.getSafeBounds({
            sidebarWidth:
              detail.sidebarWidth ?? WebViewLlmSession.DEFAULT_SIDEBAR_WIDTH,
            tabbarHeight:
              detail.tabbarHeight ?? WebViewLlmSession.DEFAULT_TABBAR_HEIGHT,
            viewportWidth: detail.viewportWidth,
          }),
        );
      }
      if (detail.url) {
        wvTab.webView.webContents.loadURL(detail.url);
        await Util.sleep(1000);
      }
      if (detail.exeScript) {
        response = await wvTab.webView.webContents.executeJavaScript(
          detail.exeScript,
        );
      }
    }
    return { response };
  }

  tabsCount() {
    return this.tabsById.size;
  }

  listTabs() {
    const { focusedTab } = this;
    return Array.from(this.tabsById.values()).map((tab) => ({
      id: tab.frameIds.values().next().value,
      title: tab.webView.webContents.getTitle(),
      url: tab.url.length > 100 ? `${tab.url.slice(0, 100)}...` : tab.url,
      focused: tab === focusedTab,
    }));
  }

  resolveUserInput(responseId: number, answer: Record<string, string>) {
    const resolver = this.userInputResolvers.get(responseId);
    if (!resolver) return;
    this.userInputResolvers.delete(responseId);
    resolver(answer);
  }

  async askUserInput<
    Q extends Record<
      string,
      | {
          type: 'string';
        }
      | {
          type: 'select';
          options: string[];
        }
    >,
  >(
    message: string,
    questions: Q,
  ): Promise<Record<Extract<keyof Q, string>, string>> {
    const responseId = Date.now() * 100 + Math.floor(Math.random() * 100);
    const promise = new Promise<Record<Extract<keyof Q, string>, string>>(
      (resolve) => {
        this.userInputResolvers.set(responseId, resolve as any);
      },
    );
    ToRendererIpc.toUser.send(this.mainWindow.webContents, {
      type: 'prompt',
      message,
      questions,
      responseId,
    });
    return promise;
  }

  async runPrompt(
    requestId: number,
    prompt: string,
    args?: Record<string, string>,
    attachments?: PromptAttachment[],
    reasoningEffort?: LlmApi.ReasoningEffort,
    modelType?: LlmApi.LlmModelType,
    frameId?: number,
  ): Promise<string | undefined> {
    const tab = typeof frameId === 'number' ? this.getTab(frameId) : undefined;
    const target = tab ?? this.focusedTab ?? this.getAnyTab();
    if (!target) return 'Tab not found';

    console.info('====>');
    console.info('prompt:', prompt);
    // console.info('testPrompt:', testPrompt);
    if (prompt === 'run test' && testPrompt) {
      const promises: Promise<string>[] = [];
      for (let i = 0; i < 3; i++) {
        const stream = LlmApi.queryLLMApi(
          testPrompt.user,
          testPrompt.system,
          null,
          `test_${Date.now()}_${i}`,
          'mid',
          'low',
        );
        promises.push(LlmApi.wrapStream(stream).catch((e) => e.message));
      }
      const result: string[] = await Promise.all(promises);
      console.info(
        'result:',
        `${app.getPath('userData')}/prompt-lab/test${new Date().toISOString().replace(/[^0-9]/g, '')}.json`,
        result,
      );
      try {
        fs.mkdirSync(`${app.getPath('userData')}/prompt-lab`);
      } catch (e) {
        console.log(e);
      }
      try {
        fs.writeFileSync(
          `${app.getPath('userData')}/prompt-lab/test${new Date().toISOString().replace(/[^0-9]/g, '')}.json`,
          JSON.stringify(result, null, 2),
        );
      } catch (e) {
        console.log(e);
      }
      return undefined;
    }

    try {
      if (!target) return 'Tab not found';
      const stream = this.startPrompt(
        requestId,
        target,
        prompt,
        args,
        attachments, // attachments
        reasoningEffort,
        modelType,
      );
      let response;
      console.info('stream:', stream);
      while ((response = await stream.next())) {
        if (!response.done) {
          console.info('pushPromptResponse:', response.value);
          target.pushPromptResponse(requestId, response.value);
        } else {
          break;
        }
      }
    } catch (e) {
      console.error('runPrompt error:', e);
      return Util.formatError(e);
    }
    return undefined;
  }

  startPrompt(
    requestId: number,
    tab: TabWebView,
    promptTxt: string,
    args?: Record<string, string>,
    attachments?: PromptAttachment[],
    reasoningEffort?: LlmApi.ReasoningEffort,
    modelType?: LlmApi.LlmModelType,
  ) {
    const existing = this.runsByRequestId.get(requestId);
    if (existing) existing.stop();

    const run = new PromptRun(this, tab, requestId);
    attachments
      ?.filter((a) => !!a.data)
      .forEach((a) => {
        this.readableFiles.set(a.name, a);
      });
    this.runsByRequestId.set(requestId, run);
    this.lastStartedRequestId = requestId;
    this.scheduleSnapshotEmit();
    return run.initPrompt(
      promptTxt,
      args,
      reasoningEffort,
      modelType,
      attachments?.map((f) => f.name),
    );
  }

  stopPrompt(requestId?: number) {
    const id = requestId ?? this.lastStartedRequestId;
    if (id === null) return { stopped: false, error: 'No prompt to stop' };
    const run = this.runsByRequestId.get(id);
    if (!run) return { stopped: false, error: 'Prompt not found' };

    run.stop();
    this.runQueue = this.runQueue.filter((v) => v !== id);
    if (this.activeRequestId === id) {
      this.activeRequestId = null;
      this.inFlightAction = false;
    }
    this.cleanupActionMapForRequest(id);
    this.scheduleSnapshotEmit();
    this.pump();
    return { stopped: true };
  }

  resumeAll() {
    for (const [requestId, run] of this.runsByRequestId.entries()) {
      if (!run.stopRequested && run.getNextAction()) {
        this.ensureRunLocked(requestId);
        this.enqueueRun(requestId);
      }
    }
  }

  allocActionId(requestId: number) {
    const actionId = this.nextActionId++;
    this.actionIdToRequestId.set(actionId, requestId);
    return actionId;
  }

  ensureRunLocked(requestId: number) {
    const run = this.runsByRequestId.get(requestId);
    if (!run || run.stopRequested) return;
    if (run.browserActionLock.tryLock()) {
      run.browserActionLock.wait
        .then(() => {
          if (this.activeRequestId === requestId) {
            this.activeRequestId = null;
            this.inFlightAction = false;
            this.scheduleSnapshotEmit();
          }
          this.pump();
        })
        .catch((err) => {
          console.error('Error waiting for browser action lock:', err);
        });
    }
  }

  enqueueRun(requestId: number) {
    if (!this.runsByRequestId.has(requestId)) return;
    if (this.activeRequestId === requestId) {
      this.pump();
      return;
    }
    if (!this.runQueue.includes(requestId)) {
      this.runQueue.push(requestId);
      this.scheduleSnapshotEmit();
    }
    this.pump();
  }

  actionDone(actionId: number, argsDelta?: Record<string, string> | undefined) {
    const requestId = this.actionIdToRequestId.get(actionId);
    if (requestId === undefined) return;
    const run = this.runsByRequestId.get(requestId);
    if (!run) return;
    run.actionDone(actionId, argsDelta);
    if (this.activeRequestId === requestId) {
      this.inFlightAction = false;
      this.pump();
    }
    this.scheduleSnapshotEmit();
  }

  actionError(actionId: number, error: string) {
    const requestId = this.actionIdToRequestId.get(actionId);
    if (requestId === undefined) return;
    const run = this.runsByRequestId.get(requestId);
    if (!run) return;
    run.actionError(actionId, error);
  }

  notifySnapshotChanged() {
    this.scheduleSnapshotEmit();
  }

  private async confirmAndDispatchHighRiskAction(
    requestId: number,
    run: PromptRun,
    nextAction: WireActionWithWaitAndRec,
  ) {
    try {
      const approved = await run.tab.confirmHighRiskAction(
        nextAction.intent ?? 'High risk action',
      );
      if (!approved) {
        this.stopPrompt(requestId);
        return;
      }
      // Keep `inFlightAction = true` until actionDone/actionError arrives.
      run.tab.pushActions([nextAction], run.args);
    } catch (err) {
      console.error('High risk approval failed:', err);
      this.stopPrompt(requestId);
    }
  }

  private collectArgKeysFromValue(value: unknown, keys: Set<string>) {
    if (typeof value === 'string') {
      const rx = /\$\{args\.([a-zA-Z0-9_]+)\}/g;
      let match: RegExpExecArray | null;
      while ((match = rx.exec(value))) {
        if (match[1]) keys.add(match[1]);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => this.collectArgKeysFromValue(v, keys));
      return;
    }
    if (!value || typeof value !== 'object') return;

    const anyValue = value as any;
    if (Array.isArray(anyValue.argKeys)) {
      anyValue.argKeys.forEach((k: unknown) => {
        if (typeof k === 'string' && k.trim()) keys.add(k);
      });
    }

    Object.values(anyValue).forEach((v) =>
      this.collectArgKeysFromValue(v, keys),
    );
  }

  private getMissingArgKeys(
    run: PromptRun,
    nextAction: WireActionWithWaitAndRec,
  ) {
    const keys = new Set<string>();
    this.collectArgKeysFromValue(nextAction.action, keys);
    this.collectArgKeysFromValue(nextAction.pre, keys);
    this.collectArgKeysFromValue(nextAction.post, keys);
    return Array.from(keys).filter((k) => {
      const v = (run.args as any)?.[k];
      if (v === undefined || v === null) return true;
      return String(v).trim().length === 0;
    });
  }

  private async ensureArgsForAction(
    requestId: number,
    run: PromptRun,
    _nextAction: WireActionWithWaitAndRec,
  ) {
    const missingKeys = new Set<string>();
    const lookAhead = run.getRemainActions().slice(0, 8);
    for (const action of lookAhead) {
      this.getMissingArgKeys(run, action).forEach((k) => missingKeys.add(k));
    }
    const missing = Array.from(missingKeys);
    if (missing.length === 0) return true;
    const questions = missing.reduce(
      (acc, key) => ({ ...acc, [key]: { type: 'string' as const } }),
      {} as Record<string, { type: 'string' }>,
    );
    const answer = await this.askUserInput(
      `Need input to continue:\n${missing.join('\n')}`,
      questions,
    );
    const values = answer ?? {};
    const allEmpty = Object.values(values).every(
      (v) => !String(v ?? '').trim(),
    );
    if (allEmpty) {
      this.stopPrompt(requestId);
      return false;
    }
    run.args = { ...run.args, ...values };
    return true;
  }

  private async handleBotherUserAction(
    requestId: number,
    run: PromptRun,
    nextAction: WireActionWithWaitAndRec,
  ) {
    try {
      const action: any = nextAction.action as any;
      const missingInfos: string[] = Array.isArray(action.missingInfos)
        ? action.missingInfos
        : [];

      const questions =
        missingInfos.length > 0
          ? missingInfos.reduce(
              (acc, key) => ({ ...acc, [key]: { type: 'string' as const } }),
              {} as Record<string, { type: 'string' }>,
            )
          : { input: { type: 'string' as const } };

      const message =
        typeof action.warn === 'string' && action.warn.trim().length
          ? action.warn
          : 'Input required to continue';

      const answer = await this.askUserInput(message, questions as any);
      const values = answer ?? {};
      const allEmpty = Object.values(values).every(
        (v) => !String(v ?? '').trim(),
      );
      if (allEmpty) {
        this.stopPrompt(requestId);
        return;
      }
      run.args = { ...run.args, ...values };
      this.actionDone(nextAction.id, values);
    } catch (err) {
      console.error('User input failed:', err);
      this.stopPrompt(requestId);
    }
  }

  private pump() {
    if (this.activeRequestId !== null) {
      if (this.inFlightAction) return;
      const run = this.runsByRequestId.get(this.activeRequestId);
      if (!run || run.stopRequested) {
        this.activeRequestId = null;
        this.inFlightAction = false;
        this.scheduleSnapshotEmit();
        this.pump();
        return;
      }
      const nextAction = run.getNextAction();
      if (!nextAction) return;
      this.inFlightAction = true;
      this.dispatchAction(nextAction, this.activeRequestId!, run);
    }

    while (this.runQueue.length) {
      const requestId = this.runQueue.shift()!;
      const run = this.runsByRequestId.get(requestId);
      if (!run || run.stopRequested) continue;
      const nextAction = run.getNextAction();
      if (!nextAction) continue;

      this.activeRequestId = requestId;
      this.inFlightAction = true;
      this.scheduleSnapshotEmit();
      this.dispatchAction(nextAction, requestId, run);
    }
  }

  private dispatchAction(
    nextAction: WireActionWithWaitAndRec,
    requestId: number,
    run: PromptRun,
  ) {
    if ((nextAction.action as any)?.k === 'tab') {
      this.handleTabAction(
        nextAction.id,
        nextAction.action as WireTabAction,
        run.args,
      );
      return;
    }
    if ((nextAction.action as any)?.k === 'botherUser') {
      this.handleBotherUserAction(requestId, run, nextAction);
      return;
    }
    (async () => {
      const ok = await this.ensureArgsForAction(requestId, run, nextAction);
      if (!ok) return;
      // if (DEBUG_CONFIRM_ALL_ACTIONS || nextAction.risk === 'h') {
      //   await this.confirmAndDispatchHighRiskAction(requestId, run, nextAction);
      //   return;
      // }
      this.focusedTab!.pushActions([nextAction], run.args);
    })();
  }

  private cleanupActionMapForRequest(requestId: number) {
    for (const [actionId, owner] of this.actionIdToRequestId.entries()) {
      if (owner === requestId) this.actionIdToRequestId.delete(actionId);
    }
  }

  private scheduleSnapshotEmit() {
    if (this.snapshotTimer) {
      this.snapshotPending = true;
      return;
    }
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      this.snapshotPending = false;
      this.focusedTab?.emitLlmSessionSnapshot(this.getSnapshot());
      if (this.snapshotPending) {
        this.scheduleSnapshotEmit();
      }
    }, 150);
  }

  getSnapshot() {
    const runs = Array.from(this.runsByRequestId.values())
      .slice()
      .sort((a, b) => a.requestId - b.requestId)
      .map((run) => ({
        requestId: run.requestId,
        stopRequested: run.stopRequested,
        args: run.args,
        actions: run.actions.map((action) => ({
          id: action.id,
          intent: action.intent,
          risk: action.risk,
          done: action.done,
          error: action.error,
          stepPrompt: action.stepPrompt,
          promptId: action.promptId,
          argsDelta: action.argsDelta,
          action: action.action,
        })),
        currentAction: run.currentAction,
        prompts: run.prompts.map((prompt) => ({
          id: prompt.id,
          parentId: prompt.parentId,
          sessionId: prompt.sessionId,
          goalPrompt: prompt.goalPrompt,
          subPrompt: prompt.subPrompt,
          argsAdded: prompt.argsAdded ?? null,
          complexity: prompt.complexity,
        })),
        breakPromptForExeErr: run.breakPromptForExeErr,
        fixingAction: run.fixingAction.length
          ? run.fixingAction.map((f) => ({
              actionId: f.action.id,
              offset: f.offset,
              promptId: f.promptId,
            }))
          : [],
        sessionQueue: run.sessionQueue.map((session) => ({
          id: session.id,
          parentId: session.parent?.id ?? null,
          promptQueue: session.promptQueue.map((prompt) => ({
            id: prompt.id,
            parentId: prompt.parentId,
            sessionId: prompt.sessionId,
            goalPrompt: prompt.goalPrompt,
            subPrompt: prompt.subPrompt,
            argsAdded: prompt.argsAdded ?? null,
            complexity: prompt.complexity,
          })),
          subSessionQueueIds: session.subSessionQueue.map((s) => s.id),
          breakPromptForExeErr: session.breakPromptForExeErr,
        })),
        runningSessionIds: run.runningSession.map((session) => session.id),
      }));
    return {
      activeRequestId: this.activeRequestId,
      runQueue: [...this.runQueue],
      runs,
    };
  }

  private cleanupTab(frameId: number) {
    const wvTab = this.getTab(frameId);
    if (wvTab) {
      try {
        wvTab.stopPrompt();
      } catch {
        // ignore cleanup errors
      }
      try {
        wvTab.webView.setVisible(false);
      } catch {
        // ignore cleanup errors
      }
      try {
        this.mainWindow?.contentView.removeChildView(wvTab.webView);
      } catch {
        // ignore cleanup errors
      }
      this.unregisterTab(frameId);
    }

    try {
      this.mainWindow?.webContents.send('tab-closed', { frameId });
    } catch {
      // ignore teardown errors
    }
  }

  private handleTabAction(
    actionId: number,
    action: WireTabAction,
    args: Record<string, string>,
  ) {
    ToRendererIpc.tab.send(this.mainWindow.webContents, {
      tabId: action.id,
      url: action.url ? CommonUtil.replaceJsTpl(action.url, args) : undefined,
      actionId,
      triggerFrameId: this.focusedTab!.webView.webContents.id,
    });
  }
}
