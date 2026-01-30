import { Profile } from '../profile';

Profile.register({
  name: 'calendar',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<Profile.ExePromptParts>>(
    sessionType: Profile.SessionType,
    promptParts: T,
  ) => {
    if (
      promptParts.userHeader &&
      promptParts.userHeader.includes('role:calendar') // from calendar.html.ts
    )
      return {
        ...promptParts,
        userHeader: `${promptParts.userHeader ?? ''}

[calendar general guide]
- **BEWARE OF DATE RULES**, look for rules about available date range in sibling label or text
- **DO NOT PICK DISABLED DATE (DISABLED in HTML TAG)**, review if you picked a date in todo
- Operate with input field if available, or:
- delegate task/subtask to interact with each calendar, do not mix with other tasks, use todo to execute step by step.
- if all date disabled, **you must lookup from larger time scale**, try month and observe, continue with year if still no good.
- change time scale button usually bind with the top month label.

[calendar trial steps]
1. Use the calendar’s fast & slow backward navigations once per each to observe the backward date scale. MUST mention button label/text & repeat times in WireStep.intent when clicked.
2. ask next executor to observe in todo with the cal year & month before trial clicks like "The calendar was MMM-YYYY before clicks made", pass state in todo over setArg.
3. Indentify stage and Estimate actual scale by looking at [html], [performed actions] & year-month in todo.
4. Navigate to the target month/year base on date change; then put “click target day” in todo to execute on the next snapshot (avoid clicking a removed/re-rendered button).
5. avoid changing the date scale (month/year) if not too many repeat clicks(>30), repeat is good enough, follow the principle of 1-4 try > observe > repeat actual clicks, back to days scale if other scale change is needed.
6. repeat clicks action MUST BE perform base on **observed date update scale** or explicit button text/label, fixing error is much more expensive then observe with a todo.
`,
      };
    return promptParts;
  },
});
