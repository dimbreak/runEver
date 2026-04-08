import { WebContents } from 'electron';

export namespace WebSkill {
  export type WebSkillFuncCall = {
    href: string;
    fnName: string;
    argJson?: string;
    res: string;
  };
  export const activeSkills = new Set<string>();
  export const webSkillFuncCalls: WebSkillFuncCall[] = [];
  export const activateSkill = (skillHref: string) => {
    activeSkills.add(skillHref);
  };
  export const callSkillFunction = async (
    wc: WebContents,
    href: string,
    fnName: string,
    argJson?: string,
  ) => {
    activeSkills.add(href);
    const res = await (wc.executeJavaScript(
      `(async () => {
        try {
          return JSON.stringify(await ${fnName}(${argJson ?? ''}));
        }catch (e) {
          return \`new Error(\${typeof e === 'object' ? JSON.stringify({...e, message: e.message}): e})\`;
        }
      })()`,
    ) as Promise<string>);
    console.log('callSkillFunction', res.length);
    webSkillFuncCalls.push({
      href,
      fnName,
      argJson,
      res,
    });
  };
  export const clearSkill = () => {
    console.log('clearSkill', webSkillFuncCalls.length);
    webSkillFuncCalls.splice(0, webSkillFuncCalls.length);
  };
  export const deactivateSkill = (skillHref: string) => {
    activeSkills.delete(skillHref);
  };
}
