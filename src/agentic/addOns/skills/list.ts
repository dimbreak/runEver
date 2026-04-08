import { AddOns } from '../addons';

const rx = /(filter|sort)(ing)? /i;

AddOns.register({
  name: 'list',
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

[list guide]
1. **Assume some items are out of the list**, MUST apply filter / sort if the goal has certain requirement before picking item.
2. rate, rank, comparison always MEANS SORTING`,
      };
    }
    return promptParts;
  },
});
