import { WebContents } from 'electron';
import { PlannerStep } from '../llm/roles/system/planner.schema';
import { defaultExecutor, defaultPlanner } from '../llm/roles/default';
import { type PlanningSession } from '../llm/roles/system/planner';
import { ExeSession } from '../llm/roles/system/executor';
import { TabWebView } from './tab';
import { WireActionWithWaitAndRisk } from '../../webView/roles/system/executor.schema';

type WireActionWithWaitAndRiskAndRec = WireActionWithWaitAndRisk & {
  done?: boolean;
  error?: string[];
  stepPrompt?: string;
  argsDelta?: Record<string, string>;
};

export class WebViewLlmSession {
  planningSession: PlanningSession;
  executionSession: ExeSession;
  plannedSteps: PlannerStep[] = [];
  args: Record<string, any> = {};
  actions: WireActionWithWaitAndRiskAndRec[] = [];
  currentAction = 0;
  actionId = 0;
  constructor(private tab: TabWebView) {
    this.planningSession = defaultPlanner.newPlanningSession();
    this.executionSession = defaultExecutor.newExeSession(
      tab.webView.webContents,
    );
  }
  async prompt(prompt: string, args: Record<string, any> = {}): Promise<void> {
    if (this.plannedSteps.length > 0) {
    }
    this.args = args;
    const { webContents } = this.tab.webView;
    const stepsStream = await this.planningSession.newPlan(`[url]
${webContents.getURL()}
[visible elements]
${JSON.stringify(await webContents.executeJavaScript('window.webView.getOcr()'))}
[task prompt]
${prompt}`);

    let res;
    while ((res = await stepsStream.next())) {
      if (res.done) {
        break;
      } else {
        this.addStep(res.value);
      }
    }
  }
  addStep(step: PlannerStep) {
    this.plannedSteps.push(step);
    if (this.plannedSteps.length === 1) {
      this.executionPromise = this.execute();
    }
  }
  executionPromise: Promise<void> = Promise.resolve();
  async execute() {
    const steps = this.plannedSteps.splice(0, this.plannedSteps.length);
    const result = await this.executionSession.execSteps(steps, this.args);
    if (result.a.length && result.a.length <= steps.length) {
      this.actions.push(
        ...result.a.map((action, i) => ({
          ...action,
          risk: steps[i].risk,
          id: this.actionId++,
          stepPrompt: steps[i].risk,
        })),
      );
    }
    await this.tab.pushActions();
  }

  getRemainActions(): WireActionWithWaitAndRiskAndRec[] {
    return this.actions.slice(this.currentAction);
  }

  actionDone(
    completedId: number,
    argsDelta: Record<string, string> | undefined,
  ) {
    if (this.actions.length === 0) return;
    const currentAction = this.actions[this.currentAction];
    if (currentAction.id !== completedId) {
      console.warn(
        'Popping actions out of order:',
        completedId,
        this.actions[this.currentAction].id,
      );
      return;
    }
    this.currentAction++;
    currentAction.done = true;
    if (argsDelta) {
      this.args = { ...this.args, ...argsDelta };
      currentAction.argsDelta = argsDelta;
    }
    console.log('Popped actions:', this.actions.length, completedId);
  }

  actionError(actionId: number, error: string) {
    if (this.actions.length === 0) return;
    const currentAction = this.actions[this.currentAction];
    if (currentAction.id !== actionId) {
      console.warn(
        'Actions error out of order:',
        actionId,
        this.actions[this.currentAction].id,
      );
      return;
    }
    if (currentAction.error) {
      currentAction.error.push(error);
    } else {
      currentAction.error = [error];
    }
    // todo pop
  }
}
