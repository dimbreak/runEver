import { SmartAction } from '../../smartAction';
import { ComboboxAction } from './combobox.schema';
import { type ExecutionSession } from '../../../session';
import { estimatePromptComplexity } from '../../../../utils/llm';
import { SmartActionSession } from '../../smartAction.class';

class ComboboxSmartAction extends SmartActionSession {
  constructor(
    private action: SmartAction.IAction<ComboboxAction>,
    parentSession: ExecutionSession,
  ) {
    super(parentSession, 'combobox');
  }
  initPrompt() {
    const { action, run } = this;
    const goalPrompt = `Set the combobox at ${action.action.q} to closest value of '${action.action.v}': ${action.intent}
    
[combobox trial steps]
0. pay special attention to role=combobox, try interact with delegate subtask of each combobox, just use tip to execute step by step.
1. Try step by step with tip, select the value base on the actual list not the just input the given value.
2. Indentify stage and suggestions by looking at [html], [performed actions] & tip, note that the suggestion list may not be under the combobox itself but a floating visible element mark with role listbox in label.
3. Focus the combobox(input element if exist), **ADD TIP** to observe the dropdown / suggestions.
4. Type the first few chars of search keyword to filter the suggestions, **ADD TIP** to observe the list.
5. Click the suggestion if the full value suggestion appeared, or keep typing to filter the suggestions if the suggestion list still long. pick with mouse click.
6. The outcome of combobox is uncertain, always add [todo] to check if the value is correctly set.
7. The display value of input may vary from dropdown list after picked, trust previous executor if the value looks close enough.`;
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
    const calendarAction = action as SmartAction.IAction<ComboboxAction>;
    const sess = parent.run.wrapSession(
      new ComboboxSmartAction(calendarAction, parent),
    );
    sess.initPrompt();
    return sess;
  }
  return null;
});
