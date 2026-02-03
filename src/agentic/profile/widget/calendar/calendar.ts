import { Profile } from '../../profile';

const rx = /<[^>]+id=([^> ]+)[^>]+label=[^> ]*role:calendar/g;

Profile.register({
  name: 'calendar',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<Profile.ExePromptParts>>(
    sessionType: Profile.SessionType,
    promptParts: T,
  ) => {
    if (
      promptParts.userHeader &&
      promptParts.userHeader.includes('role:calendar') && // from calendar.html.ts
      !promptParts.system?.startsWith('[calendar smart action]')
    ) {
      let match: RegExpExecArray | null;
      const ids: string[] = [];
      while ((match = rx.exec(promptParts.userHeader!))) {
        ids.push(match[1]);
      }
      return {
        ...promptParts,
        userHeader: `${promptParts.userHeader ?? ''}

[calendar guide]
- if the calendar do not come with input then use calendar action to set date.${
          promptParts.system?.startsWith('[fillFrom smart action]')
            ? ''
            : `
- if calendar is in a form, do fill form see if it works first.`
        }
- use i to give date requirement and give all related context, like picking earliest available date slot on weekend.
`,
        system: promptParts.system?.replace(
          'type WireAction=',
          `type WireAction=
{
  k:'calendar';
  q:'${ids.join("'|'")}'|Selector;//calendar id
  i?:string;//instruction to look for date
}|`,
        ),
      };
    }
    return promptParts;
  },
});
