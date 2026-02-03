import { WebContents } from 'electron';
import { Profile } from '../../profile';

const rteRx = / contenteditable[ >]/i;
const formRx = /<form[^>]+id=([^> ]+)[^>]+label=[^> ]*fields:([0-9]+)/g;

Profile.register({
  name: 'form',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<Profile.ExePromptParts>>(
    sessionType: Profile.SessionType,
    promptParts: T,
  ) => {
    if (promptParts.userHeader) {
      const r = promptParts;
      if (promptParts.userHeader.includes('<form ')) {
        const inSmartAction =
          promptParts.system?.startsWith('[fillForm smart action]') ?? false;
        let longForm = 0;
        let match: RegExpExecArray | null;
        const formIds: string[] = [];
        while ((match = formRx.exec(promptParts.userHeader))) {
          if (parseInt(match[2], 10) > 2) {
            longForm++;
          }
          formIds.push(match[1]);
        }

        r.userHeader = `${r.userHeader ?? ''}

[form guide]
- always use fillForm over input 1 by 1
${
  !inSmartAction
    ? `- make sure provide all info you know about the form, if data is from files, attach them in fs${
        longForm &&
        `
- fillForm must be **last step of the action chain**
- the submit/next-step button must be exclusive to other actions in the chain
- put 'VERIFY FORM VALUES IN HTML, ONLY SUBMIT IF YOU HAVE NOTHING TO CHANGE.' in tip prefix if you think the form is ready`
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
      ? `data:string;//instruction to sub executor for filling the form, suggested values
  fs:string[];//files as datasource or to upload`
      : 'data:{f:string|Selector;v:string|string[]}[];//field name or selector and value to fill, string or js argument tpl'
  }
}|`,
        );
      }
      if (rteRx.test(promptParts.userHeader)) {
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
