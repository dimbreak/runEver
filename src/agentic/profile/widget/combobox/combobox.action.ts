import { SmartAction } from '../../smartAction';
import { ComboboxAction } from './combobox.schema';
import { type ExecutionSession, ExeSessStatus } from '../../../session';
import { estimatePromptComplexity } from '../../../../utils/llm';
import { SmartActionSession } from '../../smartAction.class';

class ComboboxSmartAction extends SmartActionSession {
  constructor(
    private action: SmartAction.IAction<ComboboxAction>,
    parentSession: ExecutionSession,
  ) {
    super(parentSession, 'combobox');
    this.forceComplexity = 'l';
  }
  initPrompt() {
    const { action, run } = this;
    const goalPrompt = `Set the combobox at ${action.action.q} to closest value of '${action.action.v}': ${action.intent}

[combobox trial steps]
- Add check point for search value, check point for mouse click option value and another to check value
- Try step by step with tip, select the value base on the actual list not the search. actual value maybe different from option text, **MUST PICK BY CLICK THE OPTION**.
- **input the 50% of search keyword**, **ADD next.tipo** and let next executor to observe the list.
- Click the suggested option if the full value suggestion appeared, or keep typing a few char to filter the suggestions if the suggestion list still long. **MUST PICK WITH MOUSE CLICK ONLY**.
- The display value maybe just searching, not actually picked, **MUST PICK BY CLICK THE OPTION**.
- The display value maybe vary from expected one, pick & accept if the values close enough.
- CONFIRM WITH MOUSE CLICK even there is just one suggestion, ABSOLUTELY REQUIRED`;
    this.promptQueue.push(
      run.createPrompt(
        goalPrompt,
        undefined,
        this.id,
        estimatePromptComplexity(goalPrompt),
      ),
    );
  }
}

SmartAction.register(async (action, parent: ExecutionSession) => {
  if (action.action.k === 'combobox') {
    const comboboxAction = action as SmartAction.IAction<ComboboxAction>;
    const sess = parent.run.wrapSession(
      new ComboboxSmartAction(comboboxAction, parent),
    );
    sess.initPrompt();
    if ((comboboxAction.cp ?? null) !== null && comboboxAction.cp!.length) {
      sess.onCompleted = () => {
        const cp = parent.checklist[comboboxAction.cp![0]];
        if (typeof sess.status === 'string') {
          cp.status = ExeSessStatus.Abnormal;
          cp.comment = sess.status;
        }
      };
    }
    return sess;
  }
  return null;
});
