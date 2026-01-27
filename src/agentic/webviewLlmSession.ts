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
runever://benchmark/#/pos/create

[viewport]
w=1370 h=916

[html]
<script>const font = {"ff0":"\\"Fira Sans\\", \\"Gill Sans\\", \\"Trebuchet MS\\", sans-serif","ff1":"-apple-system, \\"system-ui\\", \\"Segoe UI\\", Roboto, Helvetica, Arial, sans-serif","ff2":"Arial, Helvetica, sans-serif"};
  const hls = {"#0":"13px / 19.5px ff1 #000","#1":"700 18px / 27px ff1 #024","#2":"14px / 21px ff1 #333","#3":"700 18px / 27px ff1 #fff","#4":"500 13px / 19.5px ff1 #07d","#5":"700 16px / 24px ff1 #333","#6":"12px / 18px ff1 #766","#7":"16px / 18px ff2 rgba(16, 16, 16, 0.3)","#8":"16px / 18px ff2 #000","#9":"16px / 24px ff1 #555","#10":"700 18px / 27px ff1 #07d","#11":"500 14px / 21px ff1 #fff","#12":"13px / 19.5px ff1 #333","#13":"700 18px / 27px ff1 #000","#14":"700 12px / 18px ff2 #333","#15":"13.328px / 18px ff2 #ccc","#16":"13.328px / 18px ff2 #aaa","#17":"18px / 27px ff1 #333","#18":"16px / 18px ff2 #333","#19":"16px / 24px ff1 #333","#20":"500 13px / 19.5px ff1 #f00"};</script><div id=__7q show xywh=28,-212,1314,1296 hls=19><span id=__0 show xywh=84,-201,118,27 hls=1>Sellfroce POS</span><div id=__7p show xywh=28,-162,1314,1246><nav id=__7 show xywh=28,-150,239,246><a id=__1 show xywh=28,-150,239,41 hls=2>Dashboard</a><a id=__2 show xywh=28,-109,239,41 hls=2>Orders</a><a id=__3 show xywh=28,-68,239,41 hls=2>Customers</a><a id=__4 show xywh=28,-27,239,41 hls=2>Inventory</a><a id=__5 show xywh=28,14,239,41 hls=2>Reports</a><a id=__6 show xywh=28,55,239,41 hls=2>Settings</a></nav><main id=__7o show xywh=268,-162,1074,1246><div id=__c show xywh=284,-146,1042,66><div id=__a show xywh=301,-129,152,32 hls=13><span id=__8 show xywh=308,-126,18,27 hls=3>📄</span><span id=__9 show xywh=341,-126,112,27>Create Order</span></div><button id=__b show xywh=1227,-129,82,32 hls=4>Refresh</button></div><form id=__7n show xywh=301,-47,1008,1082><div id=__3l show xywh=301,-47,1008,538><div id=__n show xywh=301,-47,492,538><h3 id=__d show xywh=301,-47,492,32 hls=5>Client Information</h3><div id=__g show xywh=301,-3,492,62><label id=__e show xywh=301,-3,492,18 hls=6>Client Name</label><input id=__f show xywh=301,27,492,32 val="Northwind Travel" name=clientName required hls=0 /></div><div id=__j show xywh=301,59,492,62><label id=__h show xywh=301,59,492,18 hls=6>Email</label><input id=__i show xywh=301,89,492,32 val=contact@client.com name=clientEmail type=email required hls=0 /></div><div id=__m show xywh=301,121,492,62><label id=__k show xywh=301,121,492,18 hls=6>Phone</label><input id=__l show xywh=301,151,492,32 val=555-0100 name=clientPhone required hls=0 /></div></div><div id=__3k show xywh=817,-47,492,538><h3 id=__o show xywh=817,-47,492,32 hls=5>Delivery Address</h3><div id=__r show xywh=817,-3,492,62><label id=__p show xywh=817,-3,492,18 hls=6>Street</label><input id=__q show xywh=817,27,492,32 val="123 Client St" name=address required hls=0 /></div><div id=__y show xywh=817,59,492,62><div id=__u show xywh=817,59,400,62><label id=__s show xywh=817,59,400,18 hls=6>City</label><input id=__t show xywh=817,89,400,32 val="Business City" name=city required hls=0 /></div><div id=__x show xywh=1229,59,80,62><label id=__v show xywh=1229,59,80,18 hls=6>Region</label><input id=__w show xywh=1229,89,80,32 val=ST name=region required hls=0 /></div></div><div id=__11 show xywh=817,121,492,62><label id=__z show xywh=817,121,492,18 hls=6>Postal Code</label><input id=__10 show xywh=817,151,492,32 val=12345 name=postal required hls=0 /></div><div id=__3j show xywh=817,183,492,308><label id=__12 show xywh=817,183,492,18 hls=6>Delivery Date - order takes 11 months to produce</label><div id=__3i show xywh=817,209,350,282 hls=18><div id=__19 show xywh=818,210,348,44><button id=__13 show xywh=818,210,44,44 disabled hls=7>«</button><button id=__14 show xywh=862,210,44,44 disabled hls=7>‹</button><button id=__16 show xywh=906,210,172,44 hls=8><span id=__15 show xywh=944,223,97,18>January 2026</span></button><button id=__17 show xywh=1078,210,44,44 hls=8>›</button><button id=__18 show xywh=1122,210,44,44 hls=8>»</button></div><div id=__3h show xywh=818,270,348,220><div id=__1h show xywh=818,270,348,30 hls=14><abbr id=__1a label=Monday show xywh=829,278,28,14>Mon</abbr><abbr id=__1b label=Tuesday show xywh=881,278,24,14>Tue</abbr><abbr id=__1c label=Wednesday show xywh=928,278,28,14>Wed</abbr><abbr id=__1d label=Thursday show xywh=980,278,25,14>Thu</abbr><abbr id=__1e label=Friday show xywh=1032,278,19,14>Fri</abbr><abbr id=__1f label=Saturday show xywh=1080,278,23,14>Sat</abbr><abbr id=__1g label=Sunday show xywh=1128,278,25,14>Sun</abbr></div><div id=__3g show xywh=818,300,348,190><button id=__1j show xywh=818,300,50,38 disabled hls=15><abbr id=__1i label="29 December 2025" show xywh=835,312,15,15>29</abbr></button><button id=__1l show xywh=868,300,50,38 disabled hls=15><abbr id=__1k label="30 December 2025" show xywh=885,312,15,15>30</abbr></button><button id=__1n show xywh=917,300,50,38 disabled hls=15><abbr id=__1m label="31 December 2025" show xywh=935,312,15,15>31</abbr></button><button id=__1p show xywh=967,300,50,38 disabled hls=16><abbr id=__1o label="1 January 2026" show xywh=988,312,7,15>1</abbr></button><button id=__1r show xywh=1017,300,50,38 disabled hls=16><abbr id=__1q label="2 January 2026" show xywh=1038,312,7,15>2</abbr></button><button id=__1t show xywh=1067,300,50,38 disabled hls=16><abbr id=__1s label="3 January 2026" show xywh=1088,312,7,15>3</abbr></button><button id=__1v show xywh=1116,300,50,38 disabled hls=16><abbr id=__1u label="4 January 2026" show xywh=1137,312,7,15>4</abbr></button><button id=__1x show xywh=818,338,50,38 disabled hls=16><abbr id=__1w label="5 January 2026" show xywh=839,350,7,15>5</abbr></button><button id=__1z show xywh=868,338,50,38 disabled hls=16><abbr id=__1y label="6 January 2026" show xywh=889,350,7,15>6</abbr></button><button id=__21 show xywh=917,338,50,38 disabled hls=16><abbr id=__20 label="7 January 2026" show xywh=939,350,7,15>7</abbr></button><button id=__23 show xywh=967,338,50,38 disabled hls=16><abbr id=__22 label="8 January 2026" show xywh=988,350,7,15>8</abbr></button><button id=__25 show xywh=1017,338,50,38 disabled hls=16><abbr id=__24 label="9 January 2026" show xywh=1038,350,7,15>9</abbr></button><button id=__27 show xywh=1067,338,50,38 disabled hls=16><abbr id=__26 label="10 January 2026" show xywh=1084,350,15,15>10</abbr></button><button id=__29 show xywh=1116,338,50,38 disabled hls=16><abbr id=__28 label="11 January 2026" show xywh=1134,350,14,15>11</abbr></button><button id=__2b show xywh=818,376,50,38 disabled hls=16><abbr id=__2a label="12 January 2026" show xywh=835,388,15,15>12</abbr></button><button id=__2d show xywh=868,376,50,38 disabled hls=16><abbr id=__2c label="13 January 2026" show xywh=885,388,15,15>13</abbr></button><button id=__2f show xywh=917,376,50,38 disabled hls=16><abbr id=__2e label="14 January 2026" show xywh=935,388,15,15>14</abbr></button><button id=__2h show xywh=967,376,50,38 disabled hls=16><abbr id=__2g label="15 January 2026" show xywh=985,388,15,15>15</abbr></button><button id=__2j show xywh=1017,376,50,38 disabled hls=16><abbr id=__2i label="16 January 2026" show xywh=1034,388,15,15>16</abbr></button><button id=__2l show xywh=1067,376,50,38 disabled hls=16><abbr id=__2k label="17 January 2026" show xywh=1084,388,15,15>17</abbr></button><button id=__2n show xywh=1116,376,50,38 disabled hls=16><abbr id=__2m label="18 January 2026" show xywh=1134,388,15,15>18</abbr></button><button id=__2p show xywh=818,414,50,38 disabled hls=16><abbr id=__2o label="19 January 2026" show xywh=835,426,15,15>19</abbr></button><button id=__2r show xywh=868,414,50,38 disabled hls=16><abbr id=__2q label="20 January 2026" show xywh=885,426,15,15>20</abbr></button><button id=__2t show xywh=917,414,50,38 disabled hls=16><abbr id=__2s label="21 January 2026" show xywh=935,426,15,15>21</abbr></button><button id=__2v show xywh=967,414,50,38 disabled hls=16><abbr id=__2u label="22 January 2026" show xywh=985,426,15,15>22</abbr></button><button id=__2x show xywh=1017,414,50,38 disabled hls=16><abbr id=__2w label="23 January 2026" show xywh=1034,426,15,15>23</abbr></button><button id=__2z show xywh=1067,414,50,38 disabled hls=16><abbr id=__2y label="24 January 2026" show xywh=1084,426,15,15>24</abbr></button><button id=__31 show xywh=1116,414,50,38 disabled hls=16><abbr id=__30 label="25 January 2026" show xywh=1134,426,15,15>25</abbr></button><button id=__33 show xywh=818,452,50,38 disabled hls=16><abbr id=__32 label="26 January 2026" show xywh=835,464,15,15>26</abbr></button><button id=__35 show xywh=868,452,50,38 disabled hls=16><abbr id=__34 label="27 January 2026" show xywh=885,464,15,15>27</abbr></button><button id=__37 show xywh=917,452,50,38 disabled hls=16><abbr id=__36 label="28 January 2026" show xywh=935,464,15,15>28</abbr></button><button id=__39 show xywh=967,452,50,38 disabled hls=16><abbr id=__38 label="29 January 2026" show xywh=985,464,15,15>29</abbr></button><button id=__3b show xywh=1017,452,50,38 disabled hls=16><abbr id=__3a label="30 January 2026" show xywh=1034,464,15,15>30</abbr></button><button id=__3d show xywh=1067,452,50,38 disabled hls=16><abbr id=__3c label="31 January 2026" show xywh=1084,464,15,15>31</abbr></button><button id=__3f show xywh=1116,452,50,38 disabled hls=15><abbr id=__3e label="1 February 2026" show xywh=1137,464,7,15>1</abbr></button></div></div></div></div></div></div><div id=__7i show xywh=301,515,1008,442><h3 id=__3m show xywh=301,532,1008,33 hls=5>Order Lines</h3><div id=__9h show xywh=301,693,1008,88><div id=__91 show xywh=314,706,520,62><label id=__8z show xywh=314,706,520,18 hls=6>Product</label><div id=__90 label=role:rcSelect-combobox show xywh=314,736,520,32 hls=12><input id=rc_select_1 label=role:combobox show xywh=323,737,502,30 type=search hls=0 /></div></div><div id=__96 show xywh=846,706,100,62><label id=__92 show xywh=846,706,100,18 hls=6>Unit Price</label><div id=__95 show xywh=846,732,100,36><span id=__93 show xywh=854,740,10,24 hls=9>$</span><input id=__94 show xywh=846,736,100,32 val=1200.00 type=number hls=0 /></div></div><div id=__99 show xywh=958,706,80,62><label id=__97 show xywh=958,706,80,18 hls=6>Qty</label><input id=__98 show xywh=958,736,80,32 val=1 type=number hls=0 /></div><div id=__9c show xywh=1050,706,80,62><label id=__9a show xywh=1050,706,80,18 hls=6>Disc %</label><input id=__9b show xywh=1050,736,80,32 val=0 type=number hls=0 /></div><div id=__9f show xywh=1142,712,100,56><div id=__9d show xywh=1142,712,100,18 hls=6>Subtotal</div><strong id=__9e show xywh=1168,741,75,19 hls=5>$0.001.0012.00120.001200.00</strong></div><button id=__9g show xywh=1254,736,42,32 hls=20>✕</button></div><div id=__b2 show xywh=301,809,1008,88><div id=__am show xywh=314,822,520,62><label id=__ak show xywh=314,822,520,18 hls=6>Product</label><div id=__al label=role:rcSelect-combobox show xywh=314,852,520,32 hls=12><input id=rc_select_2 label=role:combobox show xywh=323,853,502,30 type=search hls=0 /></div></div><div id=__ar show xywh=846,822,100,62><label id=__an show xywh=846,822,100,18 hls=6>Unit Price</label><div id=__aq show xywh=846,848,100,36><span id=__ao show xywh=854,856,10,24 hls=9>$</span><input id=__ap show xywh=846,852,100,32 val=80.00 type=number hls=0 /></div></div><div id=__au show xywh=958,822,80,62><label id=__as show xywh=958,822,80,18 hls=6>Qty</label><input id=__at show xywh=958,852,80,32 val=2 type=number hls=0 /></div><div id=__ax show xywh=1050,822,80,62><label id=__av show xywh=1050,822,80,18 hls=6>Disc %</label><input id=__aw show xywh=1050,852,80,32 val=0 type=number hls=0 /></div><div id=__b0 show xywh=1142,828,100,56><div id=__ay show xywh=1142,828,100,18 hls=6>Subtotal</div><strong id=__az show xywh=1178,857,65,19 hls=5>$0.000.018.0080.00160.00</strong></div><button id=__b1 show xywh=1254,852,42,32 hls=20>✕</button></div><datalist hide><option>Desk Chair- $350.00</option><option>Keyboard- $80.00</option><option>Laptop Pro- $1200.00</option><option>Travel Item 4- $26.40</option><option>Office Item 5- $31.20</option><option>Wellness Item 6- $36.00</option><option>Home Item 7- $40.80</option><option>Garden Item 8- $45.60</option><option>Tech Item 9- $50.40</option><option>Travel Item 10- $55.20</option><option>Office Item 11- $20.00</option><option>Wellness Item 12- $24.80</option><option>Home Item 13- $29.60</option><option>Garden Item 14- $34.40</option><option>Tech Item 15- $39.20</option><option>Travel Item 16- $44.00</option><option>Office Item 17- $48.80</option><option>Wellness Item 18- $53.60</option><option>Home Item 19- $58.40</option><option>Garden Item 20- $63.20</option><option>Tech Item 21- $28.00</option><option>Travel Item 22- $32.80</option><option>Office Item 23- $37.60</option><option>Wellness Item 24- $42.40</option><option>Home Item 25- $47.20</option><option>Garden Item 26- $52.00</option><option>Tech Item 27- $56.80</option><option>Travel Item 28- $61.60</option><option>Office Item 29- $66.40</option><option>Wellness Item 30- $71.20</option><option>Home Item 31- $36.00</option><option>Garden Item 32- $40.80</option><option>Tech Item 33- $45.60</option><option>Travel Item 34- $50.40</option><option>Office Item 35- $55.20</option><option>Wellness Item 36- $60.00</option><option>Home Item 37- $64.80</option><option>Garden Item 38- $69.60</option><option>Tech Item 39- $74.40</option><option>Travel Item 40- $79.20</option><option>Office Item 41- $44.00</option><option>Wellness Item 42- $48.80</option><option>Home Item 43- $53.60</option><option>Garden Item 44- $58.40</option><option>Tech Item 45- $63.20</option><option>Travel Item 46- $68.00</option><option>Office Item 47- $72.80</option><option>Wellness Item 48- $77.60</option><option>Home Item 49- $82.40</option><option>Garden Item 50- $87.20</option><option>Tech Item 51- $52.00</option><option>Travel Item 52- $56.80</option><option>Office Item 53- $61.60</option><option>Wellness Item 54- $66.40</option><option>Home Item 55- $71.20</option><option>Garden Item 56- $76.00</option><option>Tech Item 57- $80.80</option><option>Travel Item 58- $85.60</option><option>Office Item 59- $90.40</option><option>Wellness Item 60- $95.20</option><option>Home Item 61- $60.00</option><option>Garden Item 62- $64.80</option><option>Tech Item 63- $69.60</option><option>Travel Item 64- $74.40</option><option>Office Item 65- $79.20</option><option>Wellness Item 66- $84.00</option><option>Home Item 67- $88.80</option><option>Garden Item 68- $93.60</option><option>Tech Item 69- $98.40</option><option>Travel Item 70- $103.20</option><option>Office Item 71- $68.00</option><option>Wellness Item 72- $72.80</option><option>Home Item 73- $77.60</option><option>Garden Item 74- $82.40</option><option>Tech Item 75- $87.20</option><option>Travel Item 76- $92.00</option><option>Office Item 77- $96.80</option><option>Wellness Item 78- $101.60</option><option>Home Item 79- $106.40</option><option>Garden Item 80- $111.20</option><option>Tech Item 81- $76.00</option><option>Travel Item 82- $80.80</option><option>Office Item 83- $85.60</option><option>Wellness Item 84- $90.40</option><option>Home Item 85- $95.20</option><option>Garden Item 86- $100.00</option><option>Tech Item 87- $104.80</option><option>Travel Item 88- $109.60</option><option>Office Item 89- $114.40</option><option>Wellness Item 90- $119.20</option><option>Home Item 91- $84.00</option><option>Garden Item 92- $88.80</option><option>Tech Item 93- $93.60</option><option>Travel Item 94- $98.40</option><option>Office Item 95- $103.20</option><option>Wellness Item 96- $108.00</option><option>Home Item 97- $112.80</option><option>Garden Item 98- $117.60</option><option>Tech Item 99- $122.40</option><option>Travel Item 100- $127.20</option><option>Office Item 101- $92.00</option><option>Wellness Item 102- $96.80</option><option>Home Item 103- $101.60</option><option>Garden Item 104- $106.40</option><option>Tech Item 105- $111.20</option><option>Travel Item 106- $116.00</option><option>Office Item 107- $120.80</option><option>Wellness Item 108- $125.60</option><option>Home Item 109- $130.40</option><option>Garden Item 110- $135.20</option><option>Tech Item 111- $100.00</option><option>Travel Item 112- $104.80</option><option>Office Item 113- $109.60</option><option>Wellness Item 114- $114.40</option><option>Home Item 115- $119.20</option><option>Garden Item 116- $124.00</option><option>Tech Item 117- $128.80</option><option>Travel Item 118- $133.60</option><option>Office Item 119- $138.40</option><option>Wellness Item 120- $143.20</option></datalist><div id=__7g show xywh=301,577,1008,88><div id=__71 show xywh=314,590,520,62><label id=__6z show xywh=314,590,520,18 hls=6>Product</label><div id=__70 label=role:rcSelect-combobox show xywh=314,620,520,32 hls=12><input id=rc_select_0 label=role:combobox show xywh=323,621,502,30 type=search hls=0 /></div></div><div id=__76 show xywh=846,590,100,62><label id=__72 show xywh=846,590,100,18 hls=6>Unit Price</label><div id=__75 show xywh=846,616,100,36><span id=__73 show xywh=854,624,10,24 hls=9>$</span><input id=__74 show xywh=846,620,100,32 val=350.00 type=number hls=0 /></div></div><div id=__79 show xywh=958,590,80,62><label id=__77 show xywh=958,590,80,18 hls=6>Qty</label><input id=__78 show xywh=958,620,80,32 val=3 type=number hls=0 /></div><div id=__7c show xywh=1050,590,80,62><label id=__7a show xywh=1050,590,80,18 hls=6>Disc %</label><input id=__7b show xywh=1050,620,80,32 val=0 type=number hls=0 /></div><div id=__7f show xywh=1142,596,100,56><div id=__7d show xywh=1142,596,100,18 hls=6>Subtotal</div><strong id=__7e show xywh=1167,625,75,19 hls=5>$0.003.0035.00350.001050.00</strong></div><button id=__8y show xywh=1254,620,42,32 hls=20>✕</button></div><button id=__7h show xywh=301,925,131,32 hls=4>+ Add Line Item</button></div><div id=__7m show xywh=301,981,1008,54><div id=__7k show xywh=301,1004,131,27 hls=17>Total:<strong id=__7j show xywh=349,1006,83,22 hls=10>$0.003.0035.00350.001050.001051.001062.001170.002250.002250.012258.002330.002410.00</strong></div><button id=__7l show xywh=1181,999,128,36 type=submit hls=11>Preview Order</button></div></form></main></div></div><div size0><div label=role:listbox>Not Found</div></div><div size0><div label=role:listbox>Not Found</div></div><div size0><div label=role:listbox>Not Found</div></div> //138

[readable file]
- attached sample_order_form.pdf: application/pdf desc from previous read:Source purchase order with client, vendor, item quantities/prices and remark about not delivering on Monday.
**can attach with todo.readFiles**

[argument keys]
clientName: Northwind Travel
clientEmail: contact@client.com
clientPhone: 555-0100
address: 123 Client St
city: Business City
region: ST
postal: 12345
line1_product: Desk Chair- $350.00
line1_qty: 3
line1_price: 350.00
line2_product: Laptop Pro- $1200.00
line2_qty: 1
line2_price: 1200.00
line3_product: Keyboard- $80.00
line3_qty: 2
line3_price: 80.00
product: Keyboard- $80.00
qty: 2
price: 80.00

[combobox guide]
0. pay special attention to role=combobox, try interact with delegate subtask of each combobox, just use todo to execute step by step.
1. Try step by step with todo, select the value base on the actual list not the just input the given value.
2. Indentify stage and suggestions by looking at [html], [performed actions] & todo, note that the suggestion list may not be under the combobox itself but a floating visible element mark with role listbox in label. 
3. Focus the combobox(input element if exist), **ADD TODO** to observe the dropdown / suggestions.
4. Type the first few chars of search keyword to filter the suggestions, **ADD TODO** to observe the list.
5. Press enter to select if there is **only one suggestion** matched the full value and go to 7, or,
6. Click the suggestion if the full value suggestion appeared, or keep typing to filter the suggestions if the suggestion list still long.
7. Continue picking next value if exist or end task.

[form guide]
0. forms may have dynamic fields added from button or search field, **PREPARE SUFFICIENT FIELDS FOR DATA BEFORE FILLING**.
1. delegate subtasks for complex widgets like combobox, calendar etc.
2. **MUST review filled form HTML** is the value match expectation before preview/submit.

[goal]
fill the form with file
[mission]
**todo from last executor maybe outdated as page state changed, stick to the [goal] and current [HTML] page status**
After the subtask adds the new line and selects the product, click Preview Order (button id=__7l) to submit. Verify the order total matches $2410.00 before submitting. Use sample_order_form.pdf for reference.

[performed actions]
- Fill Client Information (name, email, phone).:done
- Fill Delivery Address (street, city, region, postal).:
- Add order lines: Desk Chair x3, Laptop Pro x1, Keyboard x2 with prices.:filled one new line (line2) fields; one line still needs to be added and filled (line3)
- Add a new line, set Product to \${args.line3_product}, Qty \${args.line3_qty}, Unit Price \${args.line3_price}:done
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
  | { t: 'domLongTime'; a: 'any'|'childAdd'|'childRm'|'attr'|'txt'; q: Selector;}
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

export type LlmWireResult = {
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
    descAttachment?: {
        name: string;
        desc: string;
    }[];
  } | 'finishedNoToDo';
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
