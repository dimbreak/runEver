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
    if (
      promptParts.userHeader &&
      promptParts.html &&
      rx.test(promptParts.userHeader + promptParts.html)
    ) {
      return {
        ...promptParts,
        userHeader: `${promptParts.userHeader}

[messager guide]
- in session container, if not indicated per message, left side is the session targets message, right side is users. **latest messages are at the bottom**,
- if not specified in prompt, get message / reply means last one from desire sender.
- blockHereAndWaitForNewIncomingMsg can ONLY USE IN 2 CASES: 1. [GOAL] ask you to wait somewhere, 2. you send message and wait for response, control timeout to max 60s to avoid blocking too long.
- Wait reply/repsonse === click send message button with blockHereAndWaitForNewIncomingMsg in post wait **IMMEDIATELY**. add later could miss reply
- NO ONE WILL **REPLY/RESPONSE** WITHOUT YOUR REQUEST.
- **no other action should add after blockHereAndWaitForNewIncomingMsg**
- if the last preformed action say waited, that means wait finished and you should check messages in HTML
- pay attention to sender & identify current & perivous session, **MAKE SURE the message is valid to your checklist/task**.
- **read + understand messages and attachment**, they maybe important to the workflow like adding arguments or even new task if [GOAL] permit.
- [GOAL] could ask you to accept task from specific sender, **YOU MUST ADD BY addNewTask**
- these are the typical wording in [GOAL] allows adding new task, must pay attention: (accept/take)+(new task/their advise/instruction/prompt), do what they asked/requested`,
      };
    }
    return promptParts;
  },
});
