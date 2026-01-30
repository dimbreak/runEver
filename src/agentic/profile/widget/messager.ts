import { Profile } from '../profile';

const rx =
  /(?:role:(?:dia)?log|telegram\.org\/|whatsapp\.com\/|discord\.com\/)/i;

Profile.register({
  name: 'messager',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<Profile.ExePromptParts>>(
    sessionType: Profile.SessionType,
    promptParts: T,
  ) => {
    if (promptParts.userHeader && rx.test(promptParts.userHeader)) {
      return {
        ...promptParts,
        userHeader: `${promptParts.userHeader}

[messager guide]
- in session container, if not indicated per message, left side is the session targets message, right side is users. **latest messages are at the bottom**,
- if not specified in prompt, get message / reply means last one from desire sender.
- waitMsg should only use at the very beginning or after triggering action, like send message or switch dialog, **no other action should add after waitMsg**.
- if the last preformed action say waited, that means wait finished and you should check messages in HTML
- waitMsg will set arguments, can identify new messages in HTML with waitMsg1stId/waitMsgLastId arg`,
      };
    }
    return promptParts;
  },
});
