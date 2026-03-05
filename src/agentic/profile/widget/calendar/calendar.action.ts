import { SmartAction } from '../../smartAction';
import {
  CalendarAction,
  CalendarValidateResultSchema,
} from './calendar.schema';
import { type ExecutionTask, ExeTaskStatus } from '../../../task';
import { estimatePromptComplexity } from '../../../../utils/llm';
import { SmartActionSession } from '../../smartAction.class';
import { LlmApi } from '../../../api';
import queryLLMApi = LlmApi.queryLLMApi;
import { Profile } from '../../profile';
import wrapStream = LlmApi.wrapStream;

class CalendarSmartAction extends SmartActionSession {
  constructor(
    intent: string,
    private action: SmartAction.IAction<CalendarAction>,
    parentTask: ExecutionTask,
  ) {
    super(intent, parentTask, 'calendar');
    this.forceComplexity = 'l';
    this.parentCheckPointId = action.cp?.[0];
  }
  initPrompt() {
    const { action, session } = this;
    const goalPrompt = `Set date at calendar ${action.action.q}.
**CONSTRAINTS:**
${Object.values(action.action.ctx)
  .filter((v) => !!v)
  .map((v) => `- ${v}`)
  .join('\n')}
**take all above into consideration, MUST MEET ALL CONSTRAINTS**
**date from checklist maybe wrong, try your best to pick a date according above CONSTRAINTS, it's the highest GOAL**

[calendar rules]
- **DO NOT PICK DISABLED DATE (DISABLED in HTML TAG)**
- **add check point to check if you picked a date meet all requirements at the end**, try your best to look for a enabled date in other month/year.
- no giving date in checklist, just say clicked suitable date.
- endSess if the above prompt has a delegated date is disabled and no other context give to otherwise.

[for searching available date]
- **Scan and read carefully the label or text nearby related to date**, look for the date rules.
- also scan arguments, take all these into consideration when looking for available date.
- fast forward/backward multiple months or a year without observe could miss the best date, **MUST AVOID**.
- when all showing dates are disabled, you must **CHANGE CALENDAR SCALE**, try month and observe, continue with year if still no good.
- change time scale button usually bind with the top month label. make use of that for searching available date.
- use highlight style to determine if a date is selected, should have different hls number from other dates.

[for picking delegated date]
0. return endErr if the delegated date is disabled.
1. Use the calendar’s fast & slow backward navigations once per each to observe the backward date scale. MUST mention button label/text & repeat times in WireStep.intent when clicked.
2. ask next executor to observe in tip with the cal year & month before trial clicks like "The calendar was MMM-YYYY before clicks made", pass state in tip over setArg.
3. Indentify stage and Estimate actual scale by looking at [html], [performed actions] & year-month in tip.
4. Navigate to the target month/year base on date change; then put “click target day” in tip to execute on the next snapshot (avoid clicking a removed/re-rendered button).
5. avoid changing the date scale (month/year) if not too many repeat clicks(>30), repeat is good enough, follow the principle of 1-4 try > observe > repeat actual clicks, back to days scale if other scale change is needed.
6. repeat clicks action MUST BE perform base on **observed date update scale** or explicit button text/label, fixing error is much more expensive then observe with a tip.
7. use highlight style to determine if a date is selected, should have different hls number from other dates. if delegated date disabled mean the task is impossible`;
    this.promptQueue.push(
      session.createPrompt(
        goalPrompt,
        undefined,
        this.id,
        estimatePromptComplexity(goalPrompt),
      ),
    );
    this.onBeforeChecked = this.checkDate;
  }
  checked = false;
  error: string | null = null;
  checkDate = async (task: ExecutionTask) => {
    this.checked = true;
    const { action } = this.action;
    const wc = task.session.getFocusedTab()!.webView.webContents;
    const fullHtml = (await wc.executeJavaScript(
      'window.webView.getHtml()',
    )) as string;
    const html =
      (
        await Profile.process(
          'execution',
          {
            goal: 'dummy',
            system: 'dummy',
            userHeader: 'dummy',
            html: fullHtml,
          },
          wc,
        )
      ).html ?? '';
    try {
      let result;
      let retry = 3;
      while (retry !== 0) {
        result = await this.checkDateCall(html, action);
        if (result.success) {
          if (result.data.check) {
            return;
          }
          if (this.checked) {
            this.error = `PICKING MAY NOT BE CORRECT: ${result.data.failReason}, check ctx and consider retry`;
            return;
          }
          task.handleChecklist(
            {
              k: 'checklist',
              a: 'add',
              add: [`fix validate failed: ${result.data.failReason}`],
            },
            false,
            true,
          );
          return;
        }
        retry--;
      }
    } catch (e) {
      console.error(e);
    }
  };
  checkDateCall = async (
    html: string,
    action: SmartAction.IAction<CalendarAction>['action'],
  ) => {
    return CalendarValidateResultSchema.safeParse(
      JSON.parse(
        await wrapStream(
          await queryLLMApi(
            `
[HTML]
${html}

[JOB TO VERIFY]
Set date at calendar ${action.q}.
**CONSTRAINTS:**
${Object.values(action.ctx)
  .filter((v) => !!v)
  .map((v) => `- ${v}`)
  .join('\n')}
**status mention in constraints describe initial HTML, maybe out of date**

[operator claims done]
${this.checklist.map((c) => c.checkPoint).join('\n')}

[YOUR JOB]
check carefully in [HTML] if the operator has pick a date that meet all CONSTRAINTS and hint from HTML label/text near the calendar.
please note that the date maybe picked base on availability, some dates are disabled, selected date may just indicate with diff highlightStyle(hls)
And response with the following in legal JSON format:

{
check: boolean;
failReason?: string; //short reason if check is false
}
`,
            `[ROLE]
browser action checker which verify if the operator has do a right job by looking at the [HTML].

[customised html rule]
the html contains all elements with content on the page include those out of current viewport. it skipped some of the non-significant elements like middle makeup tags.
each visible tag has xywh=x,y,width,height, some tag may has hls means highlightStyle.`,
          ),
        ),
      ),
    );
  };
}

SmartAction.register(async (action, parent: ExecutionTask) => {
  if (action.action.k === 'calendar') {
    const calendarAction = action as SmartAction.IAction<CalendarAction>;
    const sess = parent.session.wrapSession(
      new CalendarSmartAction(action.intent, calendarAction, parent),
    );
    sess.initPrompt();
    if ((calendarAction.cp ?? null) !== null && calendarAction.cp!.length) {
      sess.onCompleted = () => {
        const cp = parent.checklist[calendarAction.cp![0]];
        if (
          cp &&
          sess.status !== ExeTaskStatus.Todo &&
          sess.status !== ExeTaskStatus.Working
        ) {
          if (typeof sess.status === 'string') {
            cp.status = ExeTaskStatus.Abnormal;
            cp.comment = sess.status;
          } else {
            cp.status = sess.status;
          }
        }
      };
    }
    return sess;
  }
  return null;
});
