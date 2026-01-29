import { Profile } from '../profile';

const rx = /(filter|sort)(ing)? /i;

Profile.register({
  name: 'list',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<Profile.ExePromptParts>>(
    sessionType: Profile.SessionType,
    promptParts: T,
  ) => {
    if (promptParts.userHeader && rx.test(promptParts.userHeader)) {
      return {
        ...promptParts,
        userHeader: `${promptParts.userHeader}

[list guide]
1. **Assume some items are out of the list**, MUST apply filter / sort if the goal has certain requirement before picking item.
2. rate, rank, comparison always MEANS SORTING`,
      };
    }
    return promptParts;
  },
});
