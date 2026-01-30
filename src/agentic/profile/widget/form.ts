import { Profile } from '../profile';

const rx = / contenteditable[ >]/i;

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
        r.userHeader = `${r.userHeader ?? ''}

[form guide]
0. forms may have dynamic fields added from button or search field. Pay special attention to keyword **add line / add item / add product** etc, **PREPARE SUFFICIENT FIELDS FOR DATA BEFORE FILLING**.
1. delegate subtasks for complex widgets like combobox, calendar etc.
2. **MUST review filled form HTML** is the value match expectation before preview/submit.`;
      }
      if (rx.test(promptParts.userHeader)) {
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
