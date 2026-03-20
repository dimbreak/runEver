import { AddOns } from '../addons';

const rx = /(?:inbox|bcc)/i;

AddOns.register({
  name: 'email',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<AddOns.ExePromptParts>>(
    sessionType: AddOns.SessionType,
    promptParts: T,
  ) => {
    if (
      promptParts.userHeader &&
      promptParts.html &&
      rx.test(promptParts.html)
    ) {
      return {
        ...promptParts,
        userHeader: `${promptParts.userHeader}

[email guide]
- you must read the email in detail/reading view, and **DOWNLOAD ATTACHMENT** < 1MB even not instructed
- you cannot read email from inbox/list`,
      };
    }
    return promptParts;
  },
});
