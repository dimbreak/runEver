import { Profile } from '../profile';

Profile.register({
  name: 'iframe',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<Profile.ExePromptParts>>(
    sessionType: Profile.SessionType,
    promptParts: T,
  ) => {
    if (promptParts.userHeader && promptParts.html) {
      if (promptParts.html.includes('<iframe')) {
        return {
          ...promptParts,
          userHeader: `${promptParts.userHeader}

[iframe guide]
1. xywh in iframe is relative to iframe itself, not the whole page.`,
        };
      }
    }
    return promptParts;
  },
});
