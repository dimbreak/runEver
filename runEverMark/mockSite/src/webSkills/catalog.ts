import type { ResolvedWebSkillDefinition } from 'web-skill/dev';
import { createPosGuestWebSkillGenerator } from './posGuestSkill';
import { createPosPrepareOrderWebSkillGenerator } from './posPrepareOrderSkill';

export function getPublishedWebSkills(): ResolvedWebSkillDefinition[] {
  return [
    ...createPosGuestWebSkillGenerator().getSkills(),
    ...createPosPrepareOrderWebSkillGenerator().getSkills(),
  ];
}
