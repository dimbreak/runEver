import { AddOns } from '../addons';

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
      promptParts.html.split('cookie').length > 3
    ) {
      return {
        ...promptParts,
        userHeader: `${promptParts.userHeader}

[cookie guide]
- click accept cookie`,
      };
    }
    return promptParts;
  },
});
