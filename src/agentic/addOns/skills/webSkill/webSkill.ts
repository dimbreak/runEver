import { WebContents } from 'electron';
import { AddOns, Skill } from '../../addons';
import { WebSkill } from './webSkill.action';

AddOns.register({
  name: 'web-skill',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<AddOns.ExePromptParts>>(
    _sessionType: AddOns.SessionType,
    promptParts: T,
    webContent: WebContents,
    _skills: Record<string, Skill>,
    postTurnFns: (() => void)[],
  ) => {
    if (promptParts.userHeader && promptParts.html) {
      const skills = (await webContent.executeJavaScript(
        'Array.from(document.head.querySelectorAll(\'link[rel="web-skill"]\')).map(link=>([link.href, link.title]))',
      )) as string[][];

      if (skills.length) {
        const activatedPromises: Promise<string[]>[] = [];
        const discovered: string[][] = [];
        for (const [href, title] of skills) {
          if (WebSkill.activeSkills.has(href)) {
            activatedPromises.push(
              webContent.executeJavaScript(
                `(async ()=>await fetch('${href}').then(async (res) => [
                  '${href}',
                  res.ok ? await res.text() : \`[error]:\${res.statusText}\`,
                ]))()`,
              ) as Promise<string[]>,
            );
          } else {
            discovered.push([href, title]);
          }
        }

        const activated = await Promise.all(activatedPromises);

        if (activated.length < WebSkill.activeSkills.size) {
          Array.from(WebSkill.activeSkills.values()).forEach((s) => {
            if (activated.find((as) => s[0] === as[0]) === undefined) {
              WebSkill.activeSkills.delete(s[0]);
            }
          });
        }

        promptParts.system = promptParts.system?.replace(
          'type WireAction=',
          `type WireAction=
|{
  k:'activateWebSkill';//no other action after this
  mdUrl:'${discovered.map((ds) => ds[0]).join("'|'")}';
}${
            activated.length
              ? `|{
  k:'callWebSkill';//no other action after this
  href:'${activated.map((ws) => ws[0]).join("'|'")}';
  fnName:string;//include window._web_skills prefix
  arg?:string;//json 
}`
              : ''
          }`,
        );

        promptParts.userHeader += `
[webskill]
- webskills are instructions given to the current website, let you work with exact direct function instead of DOM action.
- work as ordinary agent skills, with discovered, activated, and called stage. should end action chain when advance stage, use next.tip to remind next executor.
- Prioritise to work with there when available and suit the GOAL, dom operation involve multiple turns, **they are slow and expensive even the dom is obvious**.${
          WebSkill.webSkillFuncCalls.length
            ? `
- when [webSkill called] return, use setArg to keep the data required in the goal if you cannot consume them in the turn.`
            : ''
        }
- limit query to reasonable size, and consume the response in the response turn if possible to avoid holding long context in argument.

${
  discovered.length
    ? `\n[Discovered WebSkill]\nIf these web-skills help with the goal, **prioritise to work with it. Activate with activateWebSkill.**\n${discovered.map((ws) => ws.join(': ')).join('\n')}
`
    : ''
}${activated.length ? `\n[Activated WebSkill]\ncall window._web_skills functions with callWebSkill, should not mix with other action.\n${activated.map((ws) => `<webSill href='${ws[0]}'>\n${ws[1]}`).join('\n</webSkill>\n')}</webSkill>\n` : ''}`;

        if (WebSkill.webSkillFuncCalls.length) {
          promptParts.userHeader += `\n[webSkill called]\n**These response only appear in this turn, use it in this turn or setArg for later**\n${WebSkill.webSkillFuncCalls.map((call) => `${call.fnName}(${call.argJson})=>${call.res}`).join('\n')}`;
          postTurnFns.push(WebSkill.clearSkill);
        }
      }
    }
    return promptParts;
  },
});
