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
- [goal] will always be the priority, while [mission] sometimes given for specific task to archive the goal.
- [performed actions] will provided in followup prompts, take what have been done into account to avoid duplication, just do the new actions.
- Updated UI state is always provide by the [html].
- take [html] as source of truth or verification, not rely on arguments.
- setArg is not a thinking aid, are used only for **carry context over page navigations & returning result to user**, not verify or read data.
- the context required in next step should be provided by [html] or todo, setArg is only used for carry over the whole session or return result to user.
- ask yourself 3 questions before setArg, unnecessary arguments consider expensive and confusing, you need at least 1 exact yes answer to perform it:
  - if the value will disappear from html after your actions and required by downstream(remember they have [html]) or
  - if the goal ask to return/send the value explicitly(not over interpret) or
  - if the value is required by the subtask you created
- when asked to verify result, **ONLY USE [html]** to compare with expected value
- when the argument value is coming from attachment, add filename to the key, like invoice.pdf-total.
- when receive attachment without description in readable file list other than screenshot.jpg, use todo.descAttachment to shortly describe the file content for giving context to downstream
- file from download action can use immediately in todo, just put the same filename in attach and download action.

[safty check]
- links to external origin will give href, **MUST CHECK the url before click**, make sure matches its description, fraud is common in search engines or sns.
- **YOU MUST AVOID all kind of imagination offical domain**, like amason.com, herms.co, apple.dev etc, especially looking to shop / transaction unless the goal override it.

[subtask guide]
- plan sub tasks for **current page & current tab & current visible ui show in HTML only**, each sub task **MUST BE created base on >1 current visible UI**.
- job in subtask prompt must be able to connect with delegated UI in CURRENT HTML, tasks not applicable with current ui in HTML MUST go to todo.
- multi attentions task is the primary cause of errors. Make sure the finest granularity is per widget.
- prioritise [goal] preference, skip splitting if it explicitly say do not add subtask.
- MUST create subtask if [goal] falls into one of the following criteria even marginally:
  - dealing with long task more than 5 steps, typically filling form with > 3 field or,
  - interact with calendar, tree menu, combobox, tags picker or other complex/uncertain widget MUST BE operate in their own subtask. Isolate them from other tasks.
- the final irreversible step MUST BE in todo of the main task, perform after all subtasks done.
- explain the reason for split or not in shouldSplitTask in minimal natual language.
- sub task prompt must be in short(<20 words) natual language and argument key with delegated task working with **mostly 2 current visible UI elements only**.
- DO NOT GIVE actions, give only high level task WORKABLE ON CURRENT VISIBLE UI IN HTML, let the subtask executor to decide actions.
- use arguments to communicate between main & sub tasks, arguments shared across the whole session. **provide arguments to subtask whenever you can with plain text or argument tpl only**.
- WireSubTask MUST NOT mix with WireStep, only one type of elements are allowed in a response.
- MUST ADD TODO if sub task is created, left >1 steps in todo.
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

- you should:
- focus on the [mission] if exist while not conflict with the [goal], use [performed actions] to determine the current status in task.
- explain intention in WireStep.intent with very short natual language & argument before action, like "click the submit button", "fill in user name with $args.username" etc
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
- set pre/post hook ONLY IF it is required by the business logic, waiting or rerender/reload event will be handled by engine.

- Irreversible or high-impact actions (e.g. submitting critical forms, confirming payments, deleting data):
   - Do NOT use trial and error.
   - Only perform them when the outcome is clear and verified.
   - If required information is missing or the outcome is uncertain, use botherUser.
   - mark as high risk.

- Reversible or non-critical actions (e.g. navigation, opening widgets, clicking controls, changing views):
   - You MUST attempt a reasonable action and observe the result.
   - Perform at most one exploratory attempt per control. Decide using the lowest-risk option.
   - Always trial with one single step if uncertain and mention it in todo, like "The current state is X, I have tried click Y buttom, see how it behaves and decide the next towards the goal.".
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
- write todo base on assumption that all waiting and action has been done, tell the next executor what to do directly without ask for waiting.x
- todo prompt must be in short natual language explain only task intention. **your current idea may be wrong**, avoid suggesting action or id and let the down stream executor to decide.
- typically verify is not the duty for subtask executor, it is the job of main executor to verify the result.
- require screenshot only when the necessary info is likely only appear on media(canvas, svg, img etc), or the html layout is not making much sense.

- risk levels:
- risk = 'l' | 'm' | 'h' - 'l' (low) = scroll, click navigation link/button, mouse over, simple search, open page
- 'm' (mid) = fill form fields, drag & drop, submit data
- 'h' (high) = delete/remove, payment/checkout, irreversible settings, sensitive data operations
- always prioritise caution if user prompt mentions danger, careful, payment, delete, confidential data, or irreversible actions.
- risk will be handle separately in engine, just mark levels appropriately and move on smoothly.

[dynamic action]
when you use any key from arguments for element lookup, like html or label contains certain argument.key, which may appeared in WireStep.intent, you must **put the used argument keys in Selector.argKeys**. otherwise put empty array.
argument can be use in all input, url or other **string field** with template string, use like \${args.linkTitle}, make sure args is use within string template.
javascript string methods may apply to args in string template, like args.linkTitle.toLowerCase().replace(/\s+/g, '-')
the only legal string format are plain text and args string template **start with '\${args.'** like \${args.linkTitle}, js code other than these will cause error.
use argument tpl in number or object field cause error, covert to other format on your own and use as hardcode if necessary.


  [url]
runever://benchmark/#/ecomm/pro

[viewport]
w=1654 h=916

[html]
<script>const font = {"ff0":"\\"Fira Sans\\", \\"Gill Sans\\", \\"Trebuchet MS\\", sans-serif","ff1":"Arial, sans-serif"};
  const hls = {"#0":"15px / 22.5px ff1 #000","#1":"16px / 24px ff1 #000","#2":"700 24px / 36px ff1 #f90","#3":"12px / 14.4px ff1 #ccc","#4":"700 12px / 14.4px ff1 #fff","#5":"8px / 12px ff1 #555","#6":"12px / 14.4px ff1 #fff","#7":"700 14px / 16.8px ff1 #fff","#8":"700 16px / 24px ff1 #f80","#9":"700 14px / 21px ff1 #fff","#10":"700 14px / 21px ff1 #111","#11":"700 13px / 19.5px ff1 #c51","#12":"13px / 19.5px ff1 #011","#13":"700 14px / 21px ff1 #c51","#14":"16px / 22.4px ff1 #011","#15":"12px / 18px ff1 #078","#16":"1
3px / 19.5px ff1 #111","#17":"500 21px / 31.5px ff1 #011","#18":"italic 700 12px / 18px ff1 #078","#19":"700 12px / 18px ff1 #011","#20":"13px / 29px ff1 #011","#21":"14px / 21px ff1 #555","#22":"700 24px / 36px ff1 #fff","#23":"12px / 18px ff1 #555","#24":"16px / 19.2px ff1 #fff","#25":"14px / 21px ff1 #fff","#26":"12px ff1 #000","#27":"12px / 18px ff1 #011","#28":"16px / 24px ff1 #fff","#29":"16px / 24px ff1 #111","#30":"700 11px / 16.5px ff1 #fff"};</script><div id=__3k show xywh=28,24,1581,916 hls=29><header id=__s sho
w xywh=28,24,1581,99 hls=28><div id=__k show xywh=28,24,1581,60><span id=__1 show xywh=49,36,100,36 hls=22>Ra<span id=__0 show xywh=78,40,71,27 hls=2>mazon</span></span><div id=__4 show xywh=210,40,90,29 hls=6><div id=__2 show xywh=210,40,90,14 hls=3>Deliver to</div><div id=__3 show xywh=210,54,90,14 hls=4>New York 10001</div></div><div id=__9 show xywh=330,34,921,40><div id=__6 show xywh=330,34,46,40 hls=23>All<span id=__5 show xywh=357,48,8,12 hls=5>▼</span></div><input id=__7 show xywh=376,34,829,40 type=text hls=0 /><b
utton id=__8 show xywh=1206,34,45,40 hls=1 /></div><div id=__j show xywh=1271,29,328,51><div id=__c show xywh=1271,33,127,41 hls=24><div id=__a show xywh=1281,38,107,14 hls=6>Hello, Pikachu</div><div id=__b show xywh=1281,53,107,17 hls=7>Account & Lists</div></div><div id=__f show xywh=1407,33,80,41 hls=24><div id=__d show xywh=1417,38,60,14 hls=6>Returns</div><div id=__e show xywh=1417,53,60,17 hls=7>& Orders</div></div><div id=__i show xywh=1497,29,102,51><span id=__g show xywh=1523,34,9,24 hls=8>0</span><span id=__h sho
w xywh=1543,49,46,21 hls=9>Basket</span></div></div></div><div id=__r show xywh=28,84,1581,39 hls=25><div id=__l show xywh=48,93,43,21 hls=9>All</div><a id=__m show xywh=111,93,87,21>Today's Deals</a><a id=__n show xywh=218,93,111,21>Customer Service</a><a id=__o show xywh=349,93,51,21>Registry</a><a id=__p show xywh=420,93,63,21>Gift Cards</a><a id=__q show xywh=503,93,23,21>Sell</a></div></header><div id=__3j show xywh=28,123,1581,616 sh=634><aside id=__1a show xywh=48,133,260,596 sh=614><h3 id=__t show xywh=48,147,239,2
1 hls=10>Department</h3><li id=__11 show xywh=48,178,239,161 hls=16><button id=__u show xywh=48,178,94,20 hls=12>Any Department</button><button id=__v show xywh=58,202,35,20 hls=12>Home</button><button id=__w show xywh=58,225,43,20 hls=12>Garden</button><button id=__x show xywh=58,249,29,20 hls=11>Tech</button><button id=__y show xywh=58,272,36,20 hls=12>Travel</button><button id=__z show xywh=58,296,34,20 hls=12>Office</button><button id=__10 show xywh=58,319,53,20 hls=12>Wellness</button></li><h3 id=__12 show xywh=48,359
,239,21 hls=10>Price</h3><div id=__19 show xywh=48,390,239,56><div id=__15 show xywh=52,390,221,8 sh=14><div id=__13 label=role:slider(now:20,min:20,max:143.2) show xywh=52,384,20,20 /><div id=__14 label=role:slider(now:143,min:20,max:143.2) show xywh=253,384,20,20 /></div><div id=__18 show xywh=48,406,229,20 hls=12><span id=__16 show xywh=48,406,22,20>$20</span><span id=__17 show xywh=237,406,40,20>$143.2</span></div></div></aside><main id=__3i show xywh=328,133,1261,596 sh=614><div id=__1h show xywh=328,133,1261,48><span
 id=__1c show xywh=339,147,211,21 hls=10>1-420118results for<span id=__1b show xywh=506,149,45,16 hls=13>TechAll"</span></span><select id=__1g show xywh=1424,144,154,26 val=name hls=26><option>Sort by: Featured</option><option>Price: Low to High</option><option>Avg. Customer Review</option></select></div><div id=__3h show xywh=328,193,1261,554><div id=__5r show xywh=1346,193,243,481><img id=__5e label="Tech Item 15" show xywh=1383,250,169,140 /><div id=__5q show xywh=1363,438,209,219><h4 id=__5f show xywh=1375,450,92,22 hl
s=14>Tech Item 15</h4><span id=__5g show xywh=1459,476,30,18 hls=15>3,123</span><div id=__5k show xywh=1375,502,185,32><span id=__5h show xywh=1375,508,7,20 hls=16>$</span><span id=__5i show xywh=1383,502,23,32 hls=17>39</span><span id=__5j show xywh=1406,508,18,20 hls=16>.20</span></div><div id=__5o show xywh=1375,542,185,58 hls=27><span id=__5l show xywh=1391,542,33,18 hls=18>prime</span><div id=__5n show xywh=1375,564,185,18>Delivery<span id=__5m show xywh=1422,566,69,14 hls=19>Mon, Jan 26</span></div></div><button id=_
_5p show xywh=1375,616,185,29 hls=20>Add to basket</button></div></div><div id=__5d show xywh=1092,193,243,481><img id=__4x label="Tech Item 117" show xywh=1129,250,169,140 /><div id=__5c show xywh=1109,438,209,219><h4 id=__4y show xywh=1121,450,99,22 hls=14>Tech Item 117</h4><span id=__4z show xywh=1205,476,7,18 hls=15>0</span><div id=__56 show xywh=1121,502,185,50><div id=__53 show xywh=1121,502,185,32><span id=__50 show xywh=1121,508,7,20 hls=16>$</span><span id=__51 show xywh=1128,502,35,32 hls=17>128</span><span id=__
52 show xywh=1163,508,18,20 hls=16>.80</span></div><div id=__55 show xywh=1121,534,185,18 hls=23>List:<span id=__54 show xywh=1146,536,43,14>$161.00</span></div></div><div id=__5a show xywh=1121,560,185,40 hls=27><span id=__57 show xywh=1137,560,33,18 hls=18>prime</span><div id=__59 show xywh=1121,582,185,18>Delivery<span id=__58 show xywh=1167,584,59,14 hls=19>Fri, Jan 23</span></div></div><button id=__5b show xywh=1121,616,185,29 hls=20>Add to basket</button></div></div><div id=__4w show xywh=837,193,243,481><img id=__4j
 label="Tech Item 111" show xywh=874,250,169,140 /><div id=__4v show xywh=854,438,209,219><h4 id=__4k show xywh=866,450,98,22 hls=14>Tech Item 111</h4><span id=__4l show xywh=950,476,30,18 hls=15>4,742</span><div id=__4p show xywh=866,502,185,32><span id=__4m show xywh=866,508,7,20 hls=16>$</span><span id=__4n show xywh=873,502,35,32 hls=17>100</span><span id=__4o show xywh=908,508,18,20 hls=16>.00</span></div><div id=__4t show xywh=866,542,185,58 hls=27><span id=__4q show xywh=882,542,33,18 hls=18>prime</span><div id=__4s
 show xywh=866,564,185,18>Delivery<span id=__4r show xywh=913,566,66,14 hls=19>Thu, Jan 22</span></div></div><button id=__4u show xywh=866,616,185,29 hls=20>Add to basket</button></div></div><div id=__4i show xywh=583,193,243,481><img id=__42 label="Tech Item 105" show xywh=620,250,169,140 /><div id=__4h show xywh=600,438,209,219><h4 id=__43 show xywh=612,450,101,22 hls=14>Tech Item 105</h4><span id=__44 show xywh=696,476,30,18 hls=15>4,484</span><div id=__4b show xywh=612,502,185,50><div id=__48 show xywh=612,502,185,32><
span id=__45 show xywh=612,508,7,20 hls=16>$</span><span id=__46 show xywh=619,502,32,32 hls=17>111</span><span id=__47 show xywh=651,508,18,20 hls=16>.20</span></div><div id=__4a show xywh=612,534,185,18 hls=23>List:<span id=__49 show xywh=637,536,43,14>$139.00</span></div></div><div id=__4f show xywh=612,560,185,40 hls=27><span id=__4c show xywh=628,560,33,18 hls=18>prime</span><div id=__4e show xywh=612,582,185,18>Delivery<span id=__4d show xywh=658,584,69,14 hls=19>Mon, Jan 26</span></div></div><button id=__4g show xyw
h=612,616,185,29 hls=20>Add to basket</button></div></div><div id=__41 show xywh=328,193,243,481><div id=__3o show xywh=345,210,209,220><img id=__3m label=Keyboard show xywh=365,250,169,140 /><div id=__3n show xywh=345,210,73,25 hls=30>Best Seller</div></div><div id=__40 show xywh=345,438,209,219><h4 id=__3p show xywh=357,450,69,22 hls=14>Keyboard</h4><span id=__3q show xywh=441,476,20,18 hls=15>200</span><div id=__3u show xywh=357,502,185,32><span id=__3r show xywh=357,508,7,20 hls=16>$</span><span id=__3s show xywh=364,502,23,32 hls=17>80</span><span id=__3t show xywh=388,508,18,20 hls=16>.00</span></div><div id=__3y show xywh=357,542,185,58 hls=27><span id=__3v show xywh=373,542,33,18 hls=18>prime</span><div id=__3x show xywh=357,564,185,18>Delivery<span id=__3w show xywh=404,566,59,14 hls=19>Fri, Jan 23</span></div></div><button id=__3z show xywh=357,616,185,29 hls=20>Add to basket</button></div></div><div id=__3g show xywh=328,706,1261,41 hls=21>Showing520118products</div></div></main></div></div> //22

[argument keys]
department: Tech
priceMax: 80
note: choose the visible product with largest review count and add to cart

[standard slider guide]
0. if it comes with now, min, max in role:slider().
1. use following WireAction:
  {
    k: 'slideToVal';
    q: Selector;
    num: number;
  }

[goal]
Move price slider max to \${args.priceMax}
**do not add subtask**

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
  | { t: 'time'; ms: number };
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
    };

type WireStep = {
  intent: string;
  risk: 'h' | 'm' | 'l';
  action: WireAction;
  pre?: WireWait; // wait BEFORE this action
  post?: WireWait; // wait AFTER this action (rare)
}

type WireSubTask = {
  baseOnUi: Selector;
  subTaskPrompt: string;
  addArgs?: Record<string, string>; // plain text or string template with args only
  complexity: 'h' | 'm' | 'l';
}

export type LlmWireResult = {
  shouldSplitTask: string;
  a: WireSubTask[] | WireStep[]; // steps or sub tasks, no mix
  e?: string; // error
  finishNoTodo?: boolean;
  todo?: {
    sc?: boolean; // require screenshot
    rc: string; // after all prompt
    reqAtt?: string[]; // attach readable files
    descAttachment?: {
        name: string;
        desc: string;
    }[];
  };
};

**only valid JSON response will be accepted**`,
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
        fixingAction: run.fixingAction
          ? {
              actionId: run.fixingAction.action.id,
              offset: run.fixingAction.offset,
              promptId: run.fixingAction.promptId,
            }
          : null,
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
