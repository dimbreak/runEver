import { ExecutionSession } from './execution';
import { TabWebView } from '../main/webView/tab';
import { WireActionWithWait, ExecutorLlmResult } from './execution.schema';
import { LlmApi } from './api';
import { Util } from '../webView/util';
import { Network } from '../webView/network';

export type WireActionWithWaitAndRec = WireActionWithWait & {
  done?: boolean;
  error?: string[];
  stepPrompt?: string;
  promptId?: number;
  argsDelta?: Record<string, string>;
  id: number;
};

type onExecCompleteHandler = (
  actions: WireActionWithWait[],
  promptId: number,
  clearQueue?: boolean,
) => Promise<string | null>;

const PlanAfterNavigation: symbol = Symbol('PlanAfterNavigation');
const PlanAfterRerender: symbol = Symbol('PlanAfterRerender');

const ExecutionMaxRetry = 1;
//
// LlmApi.addDummyReturn(
//   JSON.stringify({
//     a: [
//       {
//         intent: 'fill search box with the provided keyword',
//         risk: 'm',
//         action: {
//           k: 'input',
//           q: {
//             id: 'APjFqb',
//           },
//           v: '${args.keyword}',
//         },
//       },
//       {
//         intent: 'submit the search (press Enter) to load results',
//         risk: 'm',
//         pre: {
//           t: 'time',
//           ms: 100,
//         },
//         action: {
//           k: 'key',
//           key: 'Enter',
//           a: 'keyPress',
//           q: {
//             id: 'APjFqb',
//           },
//         },
//         post: {
//           t: 'navigation',
//         },
//       },
//     ],
//     todo: {
//       rc: "After the search results load, click the first result link whose URL contains the string in ${args.website}. If multiple results match, choose the top-most one. (I can't find result links on the current page — perform this after the results page content is available.)",
//     },
//     clearQueue: true,
//   }),
// );

export class WebViewLlmSession {
  executionSession: ExecutionSession;
  args: Record<string, any> = {};
  actions: WireActionWithWaitAndRec[] = [];
  currentAction = 0;
  actionId = 0;
  browserActionLock = Util.newLock('browserActionLock');
  browserActionLockOk = false;
  prompts: string[] = [];
  constructor(private tab: TabWebView) {
    this.executionSession = new ExecutionSession(tab);

    // LlmApi.addDummyReturn(
    //   JSON.stringify({
    //     a: [],
    //   }),
    // );
    // setInterval(() => {
    //   console.log(
    //     'All locks',
    //     this.browserActionLock,
    //     this.browserActionLockOk,
    //     this.compilePromise,
    //     this.fixingAction,
    //     this.breakPlanningForExeErr,
    //   );
    // }, 2000);
  }
  async *userPrompt(
    prompt: string,
    args?: Record<string, string>,
    reasoningEffort?: LlmApi.ReasoningEffort,
    modelType?: LlmApi.LlmModelType,
  ): AsyncGenerator<string, void, void> {
    // todo check stage prompt to correct session
    if (true) {
      const stepStrem = this.execPrompt(prompt, args);
      let step;
      let returnStr;
      while ((step = await stepStrem.next())) {
        if (!step.done) {
          switch (typeof step.value) {
            case 'object':
              switch (step.value.risk) {
                case 'h':
                  returnStr = `High risk: ${step.value.intent}`;
                  break;
                case 'm':
                  returnStr = `Medium risk: ${step.value.intent}`;
                  break;
                default:
                  returnStr = step.value.intent ?? '';
                  break;
              }
              yield returnStr;
              break;
            case 'symbol':
              if (step.value === PlanAfterNavigation) {
                yield 'Wait for navigating to a new page';
              } else if (step.value === PlanAfterRerender) {
                yield 'Wait for rerender the page';
              }
              break;
            default:
              yield step.value;
              break;
          }
        } else {
          break;
        }
      }
    }
  }

  promptQueue: {
    prompt: string;
    onExecComplete: onExecCompleteHandler | null;
  }[] = [];
  breakPromptForExeErr = false;

  async *execPrompt(
    prompt: string,
    args: Record<string, any> = {},
    unshift = false,
    onExecComplete: null | onExecCompleteHandler = null,
  ): AsyncGenerator<
    | WireActionWithWait
    | string
    | typeof PlanAfterNavigation
    | typeof PlanAfterRerender,
    void,
    void
  > {
    const promptId = this.prompts.push(prompt);
    if (this.promptQueue.length) {
      if (unshift) {
        this.promptQueue.unshift({ prompt, onExecComplete });
      } else {
        this.promptQueue.push({ prompt, onExecComplete });
      }
      return;
    }
    this.promptQueue.push({ prompt, onExecComplete });
    this.breakPromptForExeErr = false;
    this.args = args;
    let requireScreenshot = false;
    let { url } = this.tab;
    let stepsStream: AsyncGenerator<
      WireActionWithWait,
      ExecutorLlmResult,
      void
    >;
    while (this.promptQueue.length) {
      const { prompt: runPrompt, onExecComplete: onExecCompleteHandler } =
        this.promptQueue[0];
      stepsStream = await this.executionSession.execPrompt(
        runPrompt,
        this.args,
        requireScreenshot,
      );

      let res;
      const start = Date.now();
      while ((res = await stepsStream.next())) {
        if (res.done) {
          if (onExecCompleteHandler) {
            const handlerResp = await onExecCompleteHandler(
              res.value.a,
              promptId,
              res.value.clearQueue,
            );
            if (handlerResp) {
              yield handlerResp;
            }
          }
          if (res.value.todo) {
            console.log(Date.now() - start, 'Waiting for run todo');
            await this.browserActionLock.wait;
            console.log('Waiting for potential page load');
            await Promise.race([
              Util.sleep(2000),
              this.tab.pageLoadedLock.wait,
            ]);
            if (this.tab.url === url) {
              yield PlanAfterRerender;
              console.log(Date.now() - start, 'Waiting for page re-render');
              await Network.waitForNetworkIdle0(
                this.tab.networkIdle0,
                this.tab.networkIdle2,
              ).then(() => Util.sleep(1000));
            } else {
              yield PlanAfterNavigation;
              console.log(Date.now() - start, 'Waiting for page to load:', url);
              await this.tab.pageLoadedLock.wait;
              this.executionSession.resetSystemPrompt();
            }
            if (this.breakPromptForExeErr) {
              console.log(
                Date.now() - start,
                'break prompting for exe err todo',
              );
              this.breakPromptForExeErr = false;
              break;
            }
            url = this.tab.url;
            requireScreenshot = res.value.todo.sc ?? false;
            this.promptQueue.push({
              prompt: `follow up the task in [todo prompt]
              
[performed actions]
- ${this.actions.map((s) => s.intent).join('\n- ')}

[todo prompt]
${res.value.todo.rc}

[original prompt for ref]
${runPrompt}`,
              onExecComplete: onExecCompleteHandler,
            });
          }
          this.promptQueue.shift();
          break;
        } else {
          if (this.breakPromptForExeErr) {
            console.log(Date.now() - start, 'break prompting for exe err');
            this.breakPromptForExeErr = false;
            break;
          }
          if (!onExecCompleteHandler) {
            console.log(Date.now() - start, 'exec actions:', res.value);
            this.actions.push({
              ...res.value,
              promptId,
              id: this.actionId++,
            });
            this.execActions();
            yield res.value;
          }
        }
      }
      console.log(Date.now() - start, 'exec done');
    }
  }

  async execActions() {
    this.browserActionLockOk = false;
    this.browserActionLock.tryLock();
    if (!this.fixingAction) {
      this.tab.pushActions();
    }
  }

  getRemainActions(): WireActionWithWaitAndRec[] {
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
    if (this.currentAction === this.actions.length) {
      this.browserActionLock.delayUnlock(500);
    }
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
    if (actionToFix.error && actionToFix.error.length >= ExecutionMaxRetry) {
      this.breakPromptForExeErr = true;
      return;
    }
    this.execPrompt(
      `**fix the execution error in [action error]**
      
[action error]
${JSON.stringify(actionToFix)}

[upcoming actions]
- ${this.actions
        .slice(this.currentAction + 1)
        .map((a) => a.intent)
        .join('\n- ')}
        
if you found any of the above actions is wrong, press LlmWireResult.clearQueue: true in result and send the new actions.

[original prompt for ref]
${this.prompts[actionToFix.promptId!]}

`,
      this.args,
      true,
      async (newActions, promptId, clearQueue) => {
        if (clearQueue) {
          this.actions.splice(
            this.currentAction,
            this.actions.length - this.currentAction,
            {
              ...newActions[0],
              promptId,
              stepPrompt: actionToFix.stepPrompt,
              risk: actionToFix.risk,
              id: actionToFix.id,
            },
            ...newActions.slice(1).map((newAction, i) => ({
              ...newAction,
              promptId,
              stepPrompt: actionToFix.stepPrompt,
              risk: actionToFix.risk,
              id: actionToFix.id + i + 1,
            })),
          );
          this.actionId = actionToFix.id + newActions.length;
          return `Fix exection error, clear queue and got new actions: 
-${newActions.map((a) => a.intent).join('\n-')}`;
        }
        this.actions.splice(
          this.currentAction,
          1,
          {
            ...newActions[0],
            promptId,
            stepPrompt: actionToFix.stepPrompt,
            risk: actionToFix.risk,
            id: actionToFix.id,
          },
          ...newActions.slice(1).map((newAction, i) => ({
            ...newAction,
            promptId,
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
        return `Fix exection error, got new actions: 
-${newActions.map((a) => a.intent).join('\n-')}`;

        this.fixingAction = false;
        this.execActions();
      },
    );
  }
}
