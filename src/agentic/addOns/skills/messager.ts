import { WebContents } from 'electron';
import { AddOns, Skill } from '../addons';

const rx =
  /(?:role:(?:dia)?log|telegram\.org\/|whatsapp\.com\/|discord\.com\/)/i;

AddOns.register({
  name: 'messager',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<AddOns.ExePromptParts>>(
    sessionType: AddOns.SessionType,
    promptParts: T,
    webContent: WebContents,
    skills: Record<string, Skill>,
  ) => {
    if (
      promptParts.userHeader &&
      promptParts.html &&
      rx.test(promptParts.userHeader + promptParts.html)
    ) {
      delete skills.messager;
      return {
        ...promptParts,
        userHeader: `${promptParts.userHeader}

[messager guide]
- in session container, if not indicated per message, left side is the session targets message, right side is users. **latest messages are at the bottom**,
- if not specified in prompt, get message / reply means last one from desire sender.
- use clickSendBtnAndWaitReply to send message if you need a reply.
- if the last preformed action say waited, that means wait finished and you should check messages in HTML
- pay attention to sender & identify current & perivous session, **MAKE SURE the message is valid to your checklist/task**.
- **read + understand messages and attachment**, they maybe important to the workflow like adding arguments or even new task if [GOAL] permit.
- [GOAL] could ask you to accept task from specific sender, **YOU MUST ADD BY addNewTask**
- these are the typical wording in [GOAL] allows adding new task, must pay attention: (accept/take)+(new task/their advise/instruction/prompt), do what they asked/requested

`,
        system: promptParts.system
          ?.replace(
            'type WireAction=',
            `type WireAction=
|{
  k:'clickSendBtnAndWaitReply';
  btn:Selector;//send button dom
  dialog:Selector;// only apply to dialog container must seen the list before apply
  id1st:Selector;// first msg dom id in list
  idLast:Selector;// last msg dom id in list
}|{
  k:'waitForNewMsg';//only if the goal ask you to wait unconditionally or previous wait timeout and wish to extend
  dialog:Selector;
  id1st:Selector;// first msg dom id in list
  idLast:Selector;// last msg dom id in list
}`,
          )
          .replace(
            "a:'click'|'dblclick'|'mouseover'|'mouseDown'|'mouseUp'|'mouseenter'|'mousemove';",
            "a:'click'|'dblclick'|'mouseover'|'mouseDown'|'mouseUp'|'mouseenter'|'mousemove';//if you need reply, **use clickSendBtnAndWaitReply**",
          ),
      };
    }
    if (!skills.messager) {
      skills.messager = {
        name: 'messager',
        desc: 'operate web base messager & wait messages',
      };
    }

    return promptParts;
  },
});
