import { Profile } from '../profile';

Profile.register({
  name: 'combobox',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<Profile.ExePromptParts>>(
    sessionType: Profile.SessionType,
    promptParts: T,
  ) => {
    if (
      promptParts.userHeader &&
      promptParts.userHeader.includes('role:combobox')
    ) {
      // lookup from html
      return {
        ...promptParts,
        userHeader: `${promptParts.userHeader ?? ''}

[combobox guide]
0. pay special attention to role=combobox, try interact with delegate subtask of each combobox, just use todo to execute step by step.
1. Try step by step with todo, select the value base on the actual list not the just input the given value.
2. Indentify stage and suggestions by looking at [html], [performed actions] & todo, note that the suggestion list may not be under the combobox itself but a floating visible element mark with role listbox in label.
3. Focus the combobox(input element if exist), **ADD TODO** to observe the dropdown / suggestions.
4. Type the first few chars of search keyword to filter the suggestions, **ADD TODO** to observe the list.
5. Click the suggestion if the full value suggestion appeared, or keep typing to filter the suggestions if the suggestion list still long.
6. Continue picking next value if exist or end task.`,
      };
    }
    return promptParts;
  },
});
