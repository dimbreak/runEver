import { PlannerResult, PlannerStep } from '../llm/roles/system/planner.schema';
import {
  defaultAuditor,
  defaultExecutor,
  defaultPlanner,
} from '../llm/roles/default';
import { type PlanningSession } from '../llm/roles/system/planner';
import {
  ExecutorFollowupAction,
  ExeSession,
} from '../llm/roles/system/executor';
import { TabWebView } from './tab';
import { WireActionWithWaitAndRisk } from '../llm/roles/system/executor.schema';
import { LlmApi } from '../llm/api';
import { Util } from '../../webView/util';
import { AuditResult } from '../llm/roles/system/auditor.schema';
import { AuditorSession } from '../llm/roles/system/auditor';
import { Network } from '../../webView/network';

export type WireActionWithWaitAndRiskAndRec = WireActionWithWaitAndRisk & {
  done?: boolean;
  error?: string[];
  stepPrompt?: string;
  planId?: number;
  argsDelta?: Record<string, string>;
};

type PlannerStepWithPlanId = PlannerStep & { planId: number };

const PlanAfterNavigation: symbol = Symbol('PlanAfterNavigation');
const PlanAfterRerender: symbol = Symbol('PlanAfterRerender');

const ExecutorMaxRetry = 1;

export class WebViewLlmSession {
  planningSession: PlanningSession;
  executionSession: ExeSession;
  auditorSession: AuditorSession;
  plannedSteps: PlannerStepWithPlanId[] = [];
  args: Record<string, any> = {};
  actions: WireActionWithWaitAndRiskAndRec[] = [];
  currentAction = 0;
  actionId = 0;
  browserActionLock = Util.newLock('browserActionLock');
  browserActionLockOk = false;
  plans: string[] = [];
  constructor(private tab: TabWebView) {
    this.planningSession = defaultPlanner.newPlanningSession();
    this.executionSession = defaultExecutor.newExeSession(tab);
    this.auditorSession = defaultAuditor.newAuditorSession();
    // search with the argument keyword and go to the first link from the argument website on result page
    // LlmApi.addDummyReturn(
    //   JSON.stringify({
    //     steps: [
    //       {
    //         action: 'put argument keyword in the search bar',
    //         risk: 'l',
    //       },
    //       {
    //         action: 'trigger search by press enter or click the search button',
    //         risk: 'l',
    //       },
    //     ],
    //   }),
    // );
    // LlmApi.addDummyReturn(
    //   JSON.stringify({
    //     a: [
    //       {
    //         k: 'input',
    //         // eslint-disable-next-line no-template-curly-in-string
    //         v: '${args.keyword}',
    //         q: 'textarea',
    //         step: 0,
    //       },
    //       // {
    //       //   k: 'mouse',
    //       //   // eslint-disable-next-line no-template-curly-in-string
    //       //   q: 'a.zReHs:html_contains(${args.website})',
    //       //   a: 'click',
    //       //   w: 'idle0',
    //       // },
    //     ],
    //   }),
    // );
    // LlmApi.addDummyReturn(
    //   JSON.stringify({
    //     a: [
    //       {
    //         k: 'key',
    //         key: 'Enter',
    //         q: 'textarea',
    //         a: 'keyPress',
    //         step: 0,
    //       },
    //     ],
    //   }),
    // );
    // LlmApi.addDummyReturn(
    //   JSON.stringify({
    //     steps: [
    //       {
    //         action:
    //           'click on the first search result with the text of argument website',
    //         risk: 'h',
    //       },
    //     ],
    //   }),
    // );
    //
    // LlmApi.addDummyReturn(
    //   JSON.stringify({
    //     a: [
    //       {
    //         k: 'mouse',
    //         // eslint-disable-next-line no-template-curly-in-string
    //         q: 'a.zReHs:html_contains(${args.website})',
    //         a: 'click',
    //         w: 'idle0',
    //         step: 0,
    //       },
    //     ],
    //   }),
    // );
    // LlmApi.addDummyReturn(
    //   JSON.stringify({
    //     result: 'approved',
    //   } as AuditResult),
    // );
    // LlmApi.addDummyReturn('{"e":":) no more steps"}');
    // LlmApi.addDummyReturn('{"e":":) no more steps"}');
    // LlmApi.addDummyReturn('{"e":":) no more steps"}');
    // LlmApi.addDummyReturn('{"e":":) no more steps"}');
    // LlmApi.addDummyReturn('{"e":":) no more steps"}');
    // LlmApi.addDummyReturn('{"e":":) no more steps"}');
    // LlmApi.addDummyReturn('{"e":":) no more steps"}');
    // LlmApi.addDummyReturn('{"e":":) no more steps"}');

    setInterval(() => {
      console.log(
        'All locks',
        this.browserActionLock,
        this.browserActionLockOk,
        this.compilePromise,
        this.fixingAction,
        this.breakPlanningForExeErr,
      );
    }, 2000);
  }
  async *userPrompt(
    prompt: string,
    args?: Record<string, string>,
    reasoningEffort?: LlmApi.ReasoningEffort,
    modelType?: LlmApi.LlmModelType,
  ): AsyncGenerator<string, void, void> {
    // todo check stage prompt to correct session
    if (true) {
      const stepStrem = this.planPrompt(prompt, args);
      let step;
      let returnStr;
      while ((step = await stepStrem.next())) {
        if (!step.done) {
          if (step.value === PlanAfterNavigation) {
            yield 'Navigated to a new page';
          } else if (step.value === PlanAfterRerender) {
            yield 'Rerendered the page';
          } else if (typeof step.value === 'object') {
            switch (step.value.risk) {
              case 'h':
                returnStr = `High risk: ${step.value.action}`;
                break;
              case 'm':
                returnStr = `Medium risk: ${step.value.action}`;
                break;
              default:
                returnStr = step.value.action;
                break;
            }
            yield returnStr;
          }
        } else {
          break;
        }
      }
    }
  }

  plannerQueue: { prompt: string; withOcr: boolean }[] = [];
  breakPlanningForExeErr = false;

  async *planPrompt(
    prompt: string,
    args: Record<string, any> = {},
    unshift = false,
  ): AsyncGenerator<
    PlannerStep | typeof PlanAfterNavigation | typeof PlanAfterRerender,
    void,
    void
  > {
    const planId = this.plans.push(prompt);
    if (this.plannerQueue.length) {
      if (unshift) {
        this.plannerQueue.unshift({ prompt, withOcr: true });
      } else {
        this.plannerQueue.push({ prompt, withOcr: true });
      }
      return;
    }
    this.plannerQueue.push({ prompt, withOcr: true });
    this.breakPlanningForExeErr = false;
    this.args = args;
    const { webContents } = this.tab.webView;
    let planUrl = this.tab.url;
    let stepsStream: AsyncGenerator<PlannerStep, PlannerResult, void>;
    while (this.plannerQueue.length) {
      const { prompt: runPrompt, withOcr } = this.plannerQueue[0];
      const ocrResult = withOcr
        ? await webContents.executeJavaScript('window.webView.getOcr()')
        : {};
      if (ocrResult.error) {
        throw new Error(`ocr error: ${ocrResult.error}`);
      }
      stepsStream = await this.planningSession.makePlan(`[url]
${planUrl}${
        withOcr
          ? `
[visible elements]
${JSON.stringify(ocrResult)}`
          : ''
      }${
        Object.keys(args).length
          ? `
[pre-set argument keys]
${Object.keys(args).join('\n')}`
          : ''
      }
      
[task prompt]
${runPrompt}`);

      let res;
      while ((res = await stepsStream.next())) {
        console.log('plan progress:', res.done, res.value);
        if (res.done) {
          if (res.value.todo) {
            console.log('Waiting for run todo');
            await Promise.all([
              this.browserActionLock.wait,
              this.compilePromise,
            ]);
            console.log('Waiting for potential page load');
            await Promise.race([
              Util.sleep(2000),
              this.tab.pageLoadedLock.wait,
            ]);
            if (this.tab.url === planUrl) {
              yield PlanAfterRerender;
              console.log('Waiting for page re-render');
              await Network.waitForNetworkIdle0(
                this.tab.networkIdle0,
                this.tab.networkIdle2,
              ).then(() => Util.sleep(1000));
            } else {
              yield PlanAfterNavigation;
              console.log('Waiting for page to load:', planUrl);
              await this.tab.pageLoadedLock.wait;
            }
            this.executionSession.resetSystemPrompt();
            if (this.breakPlanningForExeErr) {
              console.log('break planning for exe err todo');
              this.breakPlanningForExeErr = false;
              break;
            }
            planUrl = this.tab.url;
            this.plannerQueue.push({
              prompt: `${runPrompt}
[finished steps]
${res.value.steps.map((s) => s.action).join('\n')}
[todo]
${res.value.todo}`,
              withOcr: true,
            });
          }
          this.plannerQueue.shift();
          break;
        } else {
          if (this.breakPlanningForExeErr) {
            console.log('break planning for exe err');
            this.breakPlanningForExeErr = false;
            break;
          }
          this.addStep({ ...res.value, planId }, planUrl);
          yield res.value;
        }
      }
      console.log('plan done:', this.plannedSteps.length);
    }
  }
  addStep(step: PlannerStepWithPlanId, planUrl: string) {
    console.log('addStep:', step);
    this.plannedSteps.push(step);
    this.browserActionLockOk = false;
    this.browserActionLock.tryLock();
    if (this.plannedSteps.length === 1) {
      this.compilePromise
        .then(() => {
          this.compilePromise = this.compileAction(step.planId, planUrl);
        })
        .catch(console.error);
    }
  }
  compilePromise: Promise<void> = Promise.resolve();

  async compileAction(
    planId: number,
    planUrl: string,
    retryError: string[] = [],
    executeLen = 0,
    followup: ExecutorFollowupAction | null = null,
    afterHandler:
      | null
      | ((actions: WireActionWithWaitAndRiskAndRec[]) => void) = null,
  ) {
    this.browserActionLockOk = false;
    const steps = this.plannedSteps.splice(
      0,
      executeLen || this.plannedSteps.length,
    );
    if (steps.length === 0) return;
    console.log(
      'compileAction steps:',
      steps.map((s) => s.action),
      retryError,
    );
    const result = await this.executionSession.execSteps(
      steps,
      this.args,
      retryError,
      followup,
      this.actions
        .filter((action) => action.planId === planId)
        .filter((action, i, actions) => actions.indexOf(action) === i)
        .map((action) => action.stepPrompt!),
    );
    console.log('compileAction result:', result);
    if (result.e) {
      this.handleExecutorError(result.e, planId);
      return;
    }
    const actionsToAdd: WireActionWithWaitAndRiskAndRec[] = [];
    if (result.a.length && result.a.length >= steps.length) {
      for (const action of result.a) {
        if (action.k === 'followup') {
          const followupAction: ExecutorFollowupAction = {
            ...action,
            pendingActions: this.getRemainActions(),
          };
          console.log('followupAction:', followupAction);
          this.plannedSteps.unshift(...steps.slice(action.step));
          await this.compileAction(
            planId,
            planUrl,
            retryError,
            executeLen,
            followupAction,
            (newActions) => {
              actionsToAdd.push(...newActions);
            },
          );
        }
        if (typeof action.post === 'object' && action.post.t === 'navigation') {
          action.post.url = planUrl;
        }
        if (typeof action.pre === 'object' && action.pre.t === 'navigation') {
          action.pre.url = planUrl;
        }
        actionsToAdd.push({
          ...action,
          risk: steps[action.step].risk,
          id: this.actionId++,
          stepPrompt: steps[action.step].action,
          planId,
        });
      }
      if (afterHandler) {
        afterHandler(actionsToAdd);
      } else {
        this.actions.push(...actionsToAdd);
        this.execActions();
      }
    } else if (retryError.length < ExecutorMaxRetry) {
      this.plannedSteps.unshift(...steps);
      console.log(
        'retry compileAction for len:',
        result.a.length,
        steps.length,
      );
      await this.compileAction(
        planId,
        planUrl,
        retryError.concat(
          `action count error: actions(${result.a.length}) should be >= steps(${steps.length})`,
        ),
        steps.length,
      );
      return;
    }
    if (this.plannedSteps.length !== 0) {
      console.log('compileAction next compileAction', this.plannedSteps.length);
      await this.compileAction(planId, planUrl);
    }
  }

  async execActions() {
    this.browserActionLockOk = false;
    this.browserActionLock.tryLock();
    if (!this.fixingAction) {
      this.tab.pushActions();
    }
  }

  getRemainActions(): WireActionWithWaitAndRiskAndRec[] {
    const actions = this.actions.slice(this.currentAction);
    return actions;
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
    this.compilePromise
      .then(() => {
        if (this.currentAction === this.actions.length) {
          this.browserActionLock.delayUnlock(500);
        }
      })
      .catch(console.error);
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
    this.fixAction();
  }

  fixingAction = false;
  async fixAction() {
    this.fixingAction = true;
    const actionToFix = this.actions[this.currentAction];
    this.plannedSteps.unshift({
      action: actionToFix.stepPrompt!,
      risk: actionToFix.risk,
      planId: actionToFix.planId!,
    });
    await this.compileAction(
      actionToFix.planId!,
      this.tab.url,
      [`action exec error: ${actionToFix.error?.join(', ')}`],
      1,
      null,
      (newActions: WireActionWithWaitAndRisk[]) => {
        this.actions.splice(
          this.currentAction,
          1,
          {
            ...newActions[0],
            planId: actionToFix.planId,
            stepPrompt: actionToFix.stepPrompt,
            risk: actionToFix.risk,
            id: actionToFix.id,
          },
          ...newActions.slice(1).map((newAction, i) => ({
            ...newAction,
            planId: actionToFix.planId,
            stepPrompt: actionToFix.stepPrompt,
            risk: actionToFix.risk,
            id: actionToFix.id + i + 1,
          })),
        );
        const extraId = newActions.length - 1;
        this.actionId -= newActions.length - extraId;
        if (extraId) {
          this.actions.slice(this.currentAction + extraId + 1).forEach((a) => {
            a.id += extraId;
          });
        }
        this.fixingAction = false;
        this.execActions();
      },
    );
  }
  handleExecutorError(error: string, planId: number) {
    const steps = this.plannedSteps.slice();
    this.plannedSteps.splice(0, steps.length);
    this.breakPlanningForExeErr = true;
    this.planPrompt(
      `${this.plans[planId]}
      
[planned steps]
these steps are planned by the you before will be clear:
-${steps.map((s) => s.action).join('\n-')}

[executor report error]
${error}`,
      this.args,
      true,
    );
  }

  async auditAction(
    actionId: number,
    selector: string,
    html: string,
    screenshotRect: Electron.Rectangle,
    extraInfo: Record<string, string>,
  ) {
    if (this.actions.length === 0) return 'no actions';
    const currentAction = this.actions[this.currentAction];
    if (currentAction.id !== actionId) {
      console.warn(
        'Actions error out of order:',
        actionId,
        this.actions[this.currentAction].id,
      );
      return 'out of order';
    }
    let elementHtml = html;
    let result: AuditResult;
    let screenshot = await this.tab.screenshotRect(screenshotRect);
    while (true) {
      result = await this.auditorSession.auditAction(
        this.plans[currentAction.planId!],
        this.actions
          .slice(0, this.currentAction)
          .map((action) => action.stepPrompt!)
          .filter((value, index, array) => array.indexOf(value) === index),
        currentAction,
        elementHtml,
        screenshot,
        this.args,
        extraInfo,
      );

      console.log('Audit result:', result);

      switch (result.result) {
        case 'approved':
          return null;
        case 'reject':
          return `rejected:${result.reason}`;
        case 'requireExtraDetail':
          if (result.largerScreenshot) {
            screenshot = await this.tab.screenshot();
          }
          if (result.htmlExtraLevel) {
            elementHtml = await this.tab.webView.webContents.executeJavaScript(
              `window.webView.getHtml('${selector}', ${JSON.stringify(this.args)}, 5)`,
            );
          }
          break;
        case 'requireUserApproval':
          // todo
          return null;
        default:
          return `unknown result:${JSON.stringify(result)}`;
      }
    }
  }
}
