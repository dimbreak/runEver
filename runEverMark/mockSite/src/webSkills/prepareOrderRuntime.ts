import { createPosPrepareOrderWebSkillGenerator } from './posPrepareOrderSkill';
import {
  calculateOrderTotal,
  createDraftOrderFromSkillInput,
} from './prepareOrderDraft';
import { publishWebSkills } from './publish';
import { writeSession } from '../utils/session';

export const POS_PREPARE_ORDER_EVENT = 'runEverMark:prepare-pos-order';
export const POS_PREPARE_ORDER_AUTOPREVIEW_KEY =
  'runEverMark_pos_prepare_order_autopreview';

export function publishLoggedInPosOrderSkill() {
  return publishWebSkills(
    createPosPrepareOrderWebSkillGenerator(async (input) => {
      const draft = createDraftOrderFromSkillInput(input);
      writeSession('runEverMark_pos_draft', draft);
      writeSession(POS_PREPARE_ORDER_AUTOPREVIEW_KEY, true);

      if (window.location.hash === '#/pos/create') {
        window.dispatchEvent(
          new CustomEvent(POS_PREPARE_ORDER_EVENT, {
            detail: draft,
          }),
        );
      } else {
        window.location.hash = '#/pos/create';
      }

      await waitForHashChange('#/pos/preview', 2500);

      return {
        route: '#/pos/preview',
        lineCount: draft.lines.length,
        orderTotal: calculateOrderTotal(draft.lines),
        readyForPreview: false,
      };
    }),
  );
}

function waitForHashChange(expectedHash: string, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    if (window.location.hash === expectedHash) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (
        window.location.hash === expectedHash ||
        Date.now() - startedAt >= timeoutMs
      ) {
        window.clearInterval(timer);
        resolve();
      }
    }, 50);
  });
}
