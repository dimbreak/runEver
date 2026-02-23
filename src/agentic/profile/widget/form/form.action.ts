import { SmartAction } from '../../smartAction';
import { FillFormAction } from './form.schema';
import { type ExecutionTask, ExeTaskStatus } from '../../../task';
import { estimatePromptComplexity } from '../../../../utils/llm';
import { SmartActionSession } from '../../smartAction.class';

class FillFormSmartAction extends SmartActionSession {
  constructor(
    intent: string,
    private action: SmartAction.IAction<FillFormAction>,
    parentSession: ExecutionTask,
  ) {
    super(intent, parentSession, 'fillForm');
    this.parentCheckPointId = action.cp?.[0];
  }
  initPrompt() {
    const { action, session } = this;
    const goalPrompt = `Fill the form at ${typeof action.action.q === 'string' ? action.action.q : action.action.q.id}, context: ${action.action.data}
**ignore submit request, you never submit**
**ignore if it request you to fill something not exists**

[filling guide]
- forms may have dynamic fields added from button or search field. Pay special attention to keyword **add line / add item / add product** etc, **PREPARE SUFFICIENT FIELDS FOR DATA BEFORE FILLING**.
- **MUST review filled form HTML** is the value match expectation. you are giving higher reasoning effort, try to consider all info like [GOAL], [arguments] and page status.
- avoid using enter key when filling form
- the submit/next-stage button must be clicked by parent executor, your duty is only filling the form.
- group ordinary input filling into one check point, isolate check point for special widget like calendar/combobox etc, and must add a check point to review the values at the end.
- previous executor may miss necessary info from files, re-read to check, and describe the file as CONFIRM MISSING XXX DATA if still not found.
- fill in existing fields with appropriate values, ignore differences in fields and value if it meet minimal form requirements, assign data to argument if not added.
- in case of missing data, check all source includes **FILES again if data missing** before botherUser.
- **REVIEW BLANK INPUTS**, check if it is reasonable to left blank`;
    this.promptQueue.push(
      session.createPrompt(
        goalPrompt,
        undefined,
        this.id,
        estimatePromptComplexity(goalPrompt),
        undefined,
        action.action.fs ?? undefined,
      ),
    );
    this.updateGoal = () => {
      if (
        this.checklist.filter((cp) => cp.status === ExeTaskStatus.Todo)
          .length <= 1
      ) {
        return `${
          goalPrompt
        }\n\n**make sure you filled all possible fields, and checked the values**`;
      }
      return goalPrompt;
    };
  }
}

SmartAction.register(async (action, parent: ExecutionTask) => {
  if (action.action.k === 'fillForm') {
    const fillFormAction = action as SmartAction.IAction<FillFormAction>;
    if (typeof fillFormAction.action.data === 'string') {
      const sess = parent.session.wrapSession(
        new FillFormSmartAction(action.intent, fillFormAction, parent),
      );
      sess.initPrompt();
      if ((fillFormAction.cp ?? null) !== null && fillFormAction.cp!.length) {
        sess.onCompleted = () => {
          const cp = parent.checklist[fillFormAction.cp![0]];
          if (
            cp &&
            sess.status !== ExeTaskStatus.Todo &&
            sess.status !== ExeTaskStatus.Working
          ) {
            if (typeof sess.status === 'string') {
              cp.status = ExeTaskStatus.Abnormal;
              cp.comment = sess.status;
            } else {
              cp.status = sess.status;
            }
          }
        };
      }
      return sess;
    }
  }
  return null;
});
