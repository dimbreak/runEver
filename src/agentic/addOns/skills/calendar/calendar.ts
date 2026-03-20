import { AddOns } from '../../addons';

const rx = /<[^>]+id=([^> ]+)[^>]+label=[^> ]*role:calendar/g;

AddOns.register({
  name: 'calendar',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<AddOns.ExePromptParts>>(
    sessionType: AddOns.SessionType,
    promptParts: T,
  ) => {
    if (
      promptParts.userHeader &&
      promptParts.html &&
      promptParts.html.includes('role:calendar') && // from calendar.html.ts
      !promptParts.system?.startsWith('[calendar smart action]')
    ) {
      let match: RegExpExecArray | null;
      const ids: string[] = [];
      while ((match = rx.exec(promptParts.html!))) {
        ids.push(match[1]);
      }
      return {
        ...promptParts,
        userHeader: `${promptParts.userHeader ?? ''}

[calendar guide]
- **MUST BE IN ISOLATED CHECK POINT**, cancel the original one and add seperated check points with pos to replace if it mix with other tasks before calling calendar.
- assign check point id to cp, the check point status will be handled.
- if the calendar do not come with input then use calendar action to set date.${
          promptParts.system?.startsWith('[fillFrom smart action]')
            ? ''
            : `
- if calendar is in a form, do fillForm and see if it works first.`
        }
- the calendar executor is way more professional on calendar, do not give date & how-to & argument unless **the [GOAL] explicitly mentioned**.
- Give only what [GOAL] said and full related context in i, like rules & preferences from [GOAL] or [argument], pay more attention to those mentioned date/weekday.
- let calendar executor do the job! your calculation, infer, guess in action.i will block executor, just put context & words from [GOAL]. no arguments having date value.
`,
        system: promptParts.system?.replace(
          'type WireAction=',
          `type WireAction=
{
  k:'calendar'; **you have no knowledge to pick date, no date & argument with date**
  q:'${ids.join("'|'")}'|Selector;//calendar id
  ctx:{//give only full context, **you have no knowledge to pick date, no date & argument with date**
  goalHint:string|null;//guide from [GOAL], original word only
  argValHint:string|null;//give argument values that may related to this date picking, not only the key
  pageHint:string|null;//any content on the page related?
};
}|`,
        ),
      };
    }
    return promptParts;
  },
});
