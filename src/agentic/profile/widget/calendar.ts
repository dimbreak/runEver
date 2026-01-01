import { Profile } from '../profile';

const rx = /(?:month|year|da(?:y|te))s*[\s-_]*picker|calendar/i;

Profile.register({
  name: 'calendar',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<Profile.ExePromptParts>>(
    sessionType: Profile.SessionType,
    promptParts: T,
  ) => {
    if (
      (promptParts.sub && rx.test(promptParts.sub)) ||
      (promptParts.goal && rx.test(promptParts.goal))
    )
      return {
        ...promptParts,
        userHeader: `${promptParts.userHeader ?? ''}
[calendar guide]
0. Operate with input field if available.
1. Use the calendar’s fast & slow backward navigations once per each to observe the backward date scale. MUST mention button label/text & repeat times in WireStep.intent when clicked. 
2. ask next executor to observe in todo with the cal year & month before trial clicks like "The calendar was MMM-YYYY before clicks made".
3. Indentify stage and Estimate actual scale by looking at [html], [performed actions] & year-month in todo. 
4. Navigate to the target month/year base on date change; then put “click target day” in todo to execute on the next snapshot (avoid clicking a removed/re-rendered button).
4. avoid changing the date scale (month/year) if not too many repeat clicks(>30), repeat is good enough, follow the principle of 1-4 try > observe > repeat actual clicks, back to days scale if other scale change is needed.
5. repeat clicks action MUST BE perform base on **observed date update scale** or explicit button text/label, fixing error is much more expensive then observe with a todo.`,
      };
    return promptParts;
  },
});
