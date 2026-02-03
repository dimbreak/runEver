import { SmartAction } from '../../smartAction';
import { FillFormAction } from './form.schema';
import { type ExecutionSession } from '../../../session';
import { estimatePromptComplexity } from '../../../../utils/llm';
import { SmartActionSession } from '../../smartAction.class';

class FillFormSmartAction extends SmartActionSession {
  constructor(
    private action: SmartAction.IAction<FillFormAction>,
    parentSession: ExecutionSession,
  ) {
    super(parentSession, 'fillForm');
  }
  initPrompt() {
    const { action, run } = this;
    const goalPrompt = `Fill the form at ${typeof action.action.q === 'string' ? action.action.q : action.action.q.id}: ${action.intent}

[filling guide]
- forms may have dynamic fields added from button or search field. Pay special attention to keyword **add line / add item / add product** etc, **PREPARE SUFFICIENT FIELDS FOR DATA BEFORE FILLING**.
- **MUST review filled form HTML** is the value match expectation.
- avoid using enter key when filling form
- the submit/next-stage button must be clicked by parent executor, your duty is only filling the form.
- set a [todo] to review the values at the end.`;
    this.promptQueue.push(
      run.createPrompt(
        goalPrompt,
        undefined,
        this.id,
        estimatePromptComplexity(goalPrompt),
        undefined,
        action.action.fs ?? undefined,
      ),
    );
  }
}

SmartAction.register(async (action, parent: ExecutionSession) => {
  if (action.action.k === 'fillForm') {
    const fillFormAction = action as SmartAction.IAction<FillFormAction>;
    if (typeof fillFormAction.action.data === 'string') {
      const sess = parent.run.wrapSession(
        new FillFormSmartAction(fillFormAction, parent),
      );
      sess.initPrompt();
      return sess;
    }
  }
  return null;
});
