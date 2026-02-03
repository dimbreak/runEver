import { SmartAction } from '../../smartAction';
import { CalendarAction } from './calendar.schema';
import { type ExecutionSession } from '../../../session';
import { estimatePromptComplexity } from '../../../../utils/llm';
import { SmartActionSession } from '../../smartAction.class';

class CalendarSmartAction extends SmartActionSession {
  constructor(
    private action: SmartAction.IAction<CalendarAction>,
    parentSession: ExecutionSession,
  ) {
    super(parentSession, 'calendar');
  }
  initPrompt() {
    const { action, run } = this;
    const goalPrompt = `Set the calender at ${action.action.q}: ${action.action.i} (${action.intent})

[calendar general guide]
- **DO NOT PICK DISABLED DATE (DISABLED in HTML TAG)**, add a [todo] to check if you picked a date, try your best to look for a enabled date in other month/year.
- the label or text nearby should explain the date availability rules, take that into consideration when searching for available date.
- delegate task/subtask to interact with each calendar, do not mix with other tasks, use tip to execute step by step.
- if all date disabled, **you must lookup from larger time scale**, try month and observe, continue with year if still no good.
- change time scale button usually bind with the top month label.
- use highlight style to determine if a date is selected, should have different hls number from other dates.

[calendar trial steps]
1. Use the calendar’s fast & slow backward navigations once per each to observe the backward date scale. MUST mention button label/text & repeat times in WireStep.intent when clicked.
2. ask next executor to observe in tip with the cal year & month before trial clicks like "The calendar was MMM-YYYY before clicks made", pass state in tip over setArg.
3. Indentify stage and Estimate actual scale by looking at [html], [performed actions] & year-month in tip.
4. Navigate to the target month/year base on date change; then put “click target day” in tip to execute on the next snapshot (avoid clicking a removed/re-rendered button).
5. avoid changing the date scale (month/year) if not too many repeat clicks(>30), repeat is good enough, follow the principle of 1-4 try > observe > repeat actual clicks, back to days scale if other scale change is needed.
6. repeat clicks action MUST BE perform base on **observed date update scale** or explicit button text/label, fixing error is much more expensive then observe with a tip.
7. use highlight style to determine if a date is selected, should have different hls number from other dates.`;
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
    return sess;
  }
  return null;
});
