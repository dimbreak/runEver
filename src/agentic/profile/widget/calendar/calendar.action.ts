import { SmartAction } from '../../smartAction';
import { CalendarAction } from './calendar.schema';
import { type ExecutionSession, ExeSessStatus } from '../../../session';
import { estimatePromptComplexity } from '../../../../utils/llm';
import { SmartActionSession } from '../../smartAction.class';

class CalendarSmartAction extends SmartActionSession {
  constructor(
    private action: SmartAction.IAction<CalendarAction>,
    parentSession: ExecutionSession,
  ) {
    super(parentSession, 'calendar');
    this.forceComplexity = 'l';
  }
  initPrompt() {
    const { action, run } = this;
    const goalPrompt = `Set date at calendar ${action.action.q}. Context:
${Object.entries(action.action.ctx)
  .map(([k, v]) => `${k}:${v}`)
  .join('\n')}
**try your best to pick a date according to context, argument & page status, it's the highest GOAL**

[calendar rules]
- **DO NOT PICK DISABLED DATE (DISABLED in HTML TAG)**, add check point to check if you picked a date at the end, try your best to look for a enabled date in other month/year.
- you may override above goal from upstream if it conflict with rules/page status, like specific date disabled.
- endSess if the above prompt has a delegated date is disabled and no other context give to otherwise.
- if you identified important info but not in [GOAL], setArg to keep it in context.

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
      run.createPrompt(
        goalPrompt,
        undefined,
        this.id,
        estimatePromptComplexity(goalPrompt),
      ),
    );
  }
}

SmartAction.register(async (action, parent: ExecutionSession) => {
  if (action.action.k === 'calendar') {
    const calendarAction = action as SmartAction.IAction<CalendarAction>;
    const sess = parent.run.wrapSession(
      new CalendarSmartAction(calendarAction, parent),
    );
    sess.initPrompt();
    if ((calendarAction.cp ?? null) !== null && calendarAction.cp!.length) {
      sess.onCompleted = () => {
        const cp = parent.checklist[calendarAction.cp![0]];
        console.log(cp, sess.status);
        if (
          cp &&
          sess.status !== ExeSessStatus.Todo &&
          sess.status !== ExeSessStatus.Working
        ) {
          if (typeof sess.status === 'string') {
            cp.status = ExeSessStatus.Abnormal;
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
