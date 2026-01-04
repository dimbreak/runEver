import { Profile } from '../profile';

Profile.register({
  name: 'slider',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<Profile.ExePromptParts>>(
    sessionType: Profile.SessionType,
    promptParts: T,
  ) => {
    if (promptParts.userHeader) {
      if (promptParts.userHeader.includes('role:slider')) {
        if (promptParts.userHeader.includes('role:slider(')) {
          return {
            ...promptParts,
            userHeader: `${promptParts.userHeader}

[standard slider guide]
0. if it comes with now, min, max in role:slider().
1. use following WireAction:
  {
    k: 'slideToVal';
    q: Selector;
    v: number;
  }
2. put a todo to observe the result, tolerate the value different since there maybe step size block to reach the exact value.`,
          };
        }
        return {
          ...promptParts,
          userHeader: `${promptParts.userHeader}

[slider guide]
1. **DO NOT SPLIT INTO SUBTASKS** for interactions of one slider bar, just use todo to execute step by step.
2. focus and trial with Left/Right/Up/Down key downUp once to observe the result, mention in intent the key pressed.
3. ask next executor to observe in todo with the original value before trial clicks like "The left slider was XXX before adjust by Left", pass state in todo over setArg.
4. repeat the key downUp until the slider reach the closest value, tolerate the value different since there maybe step size block to reach the exact value.`,
        };
      }
    }
    return promptParts;
  },
});
