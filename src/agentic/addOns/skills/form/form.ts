import { WebContents } from 'electron';
import { AddOns } from '../../addons';

const rteRx = / contenteditable[ >]/i;
const formRx = /<form[^>]+id=([^> ]+)[^>]+label=[^> ]*fields:([0-9]+)/g;

AddOns.register({
  name: 'form',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<AddOns.ExePromptParts>>(
    sessionType: AddOns.SessionType,
    promptParts: T,
  ) => {
    if (promptParts.userHeader && promptParts.html) {
      const r = promptParts;
      if (promptParts.html.includes('<form ')) {
        const inSmartAction =
          promptParts.system?.startsWith('[fillForm smart action]') ?? false;
        let longForm = 0;
        let match: RegExpExecArray | null;
        const formIds: string[] = [];
        while ((match = formRx.exec(promptParts.html))) {
          if (parseInt(match[2], 10) > 2) {
            longForm++;
          }
          formIds.push(match[1]);
        }

        r.userHeader = `${r.userHeader ?? ''}

[form guide]
- always use fillForm over input 1 by 1 except simple search
${
  !inSmartAction
    ? `- make sure provide all info you know about the form, if data is from files, add them to fs
- provide any [GOAL] and context if any other task in [GOAL] related to widget within the form${
        longForm &&
        `
- fillForm **MUST BE IN ISOLATED CHECK POINT**, cancel the original one and add separated check points with pos to replace if it mix with other tasks before calling fillForm.
- assign check point id to cp, the check point status will be handled.
- review before submit`
      }`
    : ''
}`;
        r.system = r.system?.replace(
          'type WireAction=',
          `type WireAction=
{
  k:'fillForm';
  q:'${formIds.join("'|'")}'|Selector;//form id
  ${
    longForm && !inSmartAction
      ? `data:string;//short, give data context and instruction from [GOAL] only, no how-to and telling field names
  fs:string[];//files as datasource or to upload`
      : 'data:{f:string|Selector;v:string|string[]}[];//field name or selector and value to fill, string or js argument tpl'
  }
}|`,
        );
      }
      if (rteRx.test(promptParts.html)) {
        r.userHeader = `${r.userHeader ?? ''}

[contentEditable RTE guide]
- use toolbar for makeups
- HTML can only be use when it comes with html mode
`;
      }
      return r;
    }
    return promptParts;
  },
});
