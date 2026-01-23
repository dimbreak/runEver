export namespace Profile {
  export type SessionType = 'execution';
  type BasePromptParts = { system?: string; userHeader: string };
  export type ExePromptParts = {
    type: 'execution';
    goal: string;
    sub?: string;
  } & BasePromptParts;
  export type PromptParts = ExePromptParts;

  export interface PromptProfile {
    name: string;
    workWithSession: '*' | SessionType[];
    promptPreprocess?: <T extends Partial<PromptParts>>(
      sessionType: SessionType,
      promptParts: T,
    ) => Promise<T>;
  }

  const profiles: PromptProfile[] = [];
  export const register = (profile: PromptProfile) => {
    profiles.push(profile);
  };
  export const process = async (
    sessionType: SessionType,
    promptParts: Partial<PromptParts>,
  ) => {
    let acc: Partial<PromptParts> = promptParts;
    for (const profile of profiles) {
      if (
        profile.workWithSession === '*' ||
        profile.workWithSession.includes(sessionType)
      ) {
        acc = {
          ...acc,
          ...(await profile.promptPreprocess?.(sessionType, acc)),
        };
      }
    }
    return acc;
  };
}
