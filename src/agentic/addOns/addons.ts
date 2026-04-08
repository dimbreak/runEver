import { WebContents } from 'electron';

export type Skill = {
  name: string;
  desc?: string;
  activated?: boolean;
};

export namespace AddOns {
  export type SessionType = 'execution';
  const skills: Record<string, Skill> = {};
  let activeSkills: string[] = [];
  type BasePromptParts = { system?: string; userHeader: string };
  export type ExePromptParts = {
    type: 'execution';
    goal: string;
    sub?: string;
    html?: string;
  } & BasePromptParts;
  export type PromptParts = ExePromptParts;

  export interface PromptSkill {
    name: string;
    workWithSession: '*' | SessionType[];
    promptPreprocess?: <T extends Partial<PromptParts>>(
      sessionType: SessionType,
      promptParts: T,
      webContent: WebContents,
      skills: Record<string, Skill>,
      postTurnFns: (() => void)[],
    ) => Promise<T>;
  }

  export const deactivateSkill = (names: string[]) => {
    names.forEach((name) => {
      activeSkills = activeSkills.filter((n) => n !== name);
      delete skills[name];
    });
  };

  export const activateSkills = (names: string[]) => {
    names.forEach((name) => {
      if (activeSkills.includes(name)) {
        return;
      }
      activeSkills.push(name);
      if (skills[name]) {
        skills[name].activated = true;
        return;
      }
      skills[name] = { name, activated: true };
    });
  };

  const addOns: PromptSkill[] = [];
  export const register = (profile: PromptSkill) => {
    addOns.push(profile);
  };
  const postTurnFns: (() => Promise<void>)[] = [];
  export const process = async (
    sessionType: SessionType,
    promptParts: Partial<PromptParts>,
    webContent: WebContents,
  ) => {
    let acc: Partial<PromptParts> = promptParts;
    for (const addOn of addOns) {
      if (
        addOn.workWithSession === '*' ||
        addOn.workWithSession.includes(sessionType)
      ) {
        acc = {
          ...acc,
          ...(await addOn.promptPreprocess?.(
            sessionType,
            acc,
            webContent,
            skills,
            postTurnFns,
          )),
        };
      }
    }
    if (acc.userHeader) {
      if (Object.values(skills).filter((s) => !s.activated).length !== 0) {
        acc.userHeader = `${acc.userHeader}

[installed skills]
${Object.keys(skills)
  .map((k) => `${k}: ${skills[k].desc}`)
  .join('\n')}
**activate with 'activateInstalledSkills', set cp to bind check point**`;
        acc.system = acc.system?.replace(
          'type WireAction=',
          `type WireAction=
|{
  k:'activateInstalledSkills';
  s:string[];//skill names
}`,
        );
      }
    }
    return acc;
  };

  export async function postTurnDone() {
    if (postTurnFns.length) {
      await Promise.all(postTurnFns.map((postTurnFn) => postTurnFn()));
      postTurnFns.splice(0, postTurnFns.length);
    }
  }
}
