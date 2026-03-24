import { AddOns } from '../../addons';

const rx = /<[^>]+id=([^> ]+)[^>]+label=[^> ]*role:combobox/g;

AddOns.register({
  name: 'combobox',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<AddOns.ExePromptParts>>(
    sessionType: AddOns.SessionType,
    promptParts: T,
  ) => {
    if (
      promptParts.userHeader &&
      promptParts.html &&
      promptParts.html.includes('role:combobox') &&
      !promptParts.system?.startsWith('[combobox smart action]')
    ) {
      let match: RegExpExecArray | null;
      const ids: string[] = [];
      while ((match = rx.exec(promptParts.html!))) {
        if (!match[0].startsWith('<select')) {
          ids.push(match[1]);
        }
      }
      if (ids.length) {
        return {
          ...promptParts,
          userHeader: `${promptParts.userHeader ?? ''}

[combobox guide]
- use combobox action to set value.${
            promptParts.system?.startsWith('[fillFrom smart action]')
              ? ''
              : `
- if combobox is in a long form, do fill form see if it works first.`
          }
- combobox action **MUST BE IN ISOLATED CHECK POINT**, cancel the original one and add seperated check points with pos to replace if it mix with other tasks before calling combobox.
- assign check point id to cp, the check point status will be handled.
- combobox may not have the exact value, action will try to find the closest one.
- MUST USE CLICK TO PICK VALUE, **enter key may accidentally submit the form, it is danger**`,
          system: promptParts.system?.replace(
            'type WireAction=',
            `type WireAction=
{
  k:'combobox';
  q:'${ids.join("'|'")}'|Selector;//combobox id
  v:string;//value
}|`,
          ),
        };
      }
    }
    return promptParts;
  },
});
