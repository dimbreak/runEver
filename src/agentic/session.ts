import { ExecutionPrompter } from './execution';
import { TabWebView } from '../main/webView/tab';
import {
  WireActionWithWait,
  ExecutorLlmResult,
  WireSubTask,
  RiskOrComplexityLevel,
} from './execution.schema';
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

const PlanAfterNavigation: symbol = Symbol('PlanAfterNavigation');
const PlanAfterRerender: symbol = Symbol('PlanAfterRerender');

const ExecutionMaxRetry = 3;

// LlmApi.addDummyReturn(
//   `{
//   "shouldSpiltTask": "yes: form has multiple fields and calendar interaction (likely >5 actions and uncertain UI)",
//   "a": [
//     {
//       "subTaskPrompt": "Fill full name and work email with provided values",
//       "addArgs": {
//         "fullName": "Jamie Parker",
//         "workEmail": "jamie.parker+742@example.com"
//       },
//       "complexity": "m"
//     },
//     {
//       "subTaskPrompt": "Set birthday in the calendar to \${birthYear}-\${birthMonth}-\${birthDay}",
//       "addArgs": {
//         "birthYear": "2000",
//         "birthMonth": "01",
//         "birthDay": "15"
//       },
//       "complexity": "h"
//     },
//     {
//       "subTaskPrompt": "Fill password and confirm password with the provided password",
//       "addArgs": {
//         "password": "S3cureP@ssw0rd!"
//       },
//       "complexity": "m"
//     }
//   ],
//   "todo": {
//     "sc": false,
//     "rc": "Verify that inputs fullName, workEmail, birthYear/birthMonth/birthDay, and password were filled correctly; if correct, click the 'Create account' button to submit."
//   },
//   "clearQueue": false
// }`,
// );
// LlmApi.addDummyReturn(`{
//   "shouldSpiltTask": "no - only two obvious input fields to fill",
//   "a": [
//     {
//       "intent": "fill Full name with \${args.fullName}",
//       "risk": "m",
//       "action": {
//         "k": "input",
//         "q": {
//           "id": "__7",
//           "argKeys": [
//             "fullName"
//           ]
//         },
//         "v": "\${args.fullName}"
//       }
//     },
//     {
//       "intent": "fill Work email with \${args.workEmail}",
//       "risk": "m",
//       "action": {
//         "k": "input",
//         "q": {
//           "id": "__9",
//           "argKeys": [
//             "workEmail"
//           ]
//         },
//         "v": "\${args.workEmail}"
//       }
//     }
//   ],
//   "clearQueue": false
// }`);
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
//
// LlmApi.addDummyReturn(
//   JSON.stringify({
//     a: [
//       {
//         intent:
//           'click the first result link that goes to Wikipedia (use anchor id __78)',
//         risk: 'l',
//         action: {
//           k: 'mouse',
//           a: 'click',
//           q: '__78',
//         },
//         post: {
//           t: 'navigation',
//         },
//       },
//     ],
//     clearQueue: true,
//   }),
// );

type Prompt = {
  id: number;
  parentId?: number;
  sessionId?: number;
  goalPrompt: string;
  subPrompt?: string;
  argsAdded?: Record<string, string> | null;
  complexity?: RiskOrComplexityLevel;
};

const estimatePromptComplexity = (prompt: string) => {
  const p = prompt.toLowerCase();
  if (/verify|confirm|make sure|\[action error]/.test(p)) return 'h';
  // eslint-disable-next-line no-nested-ternary
  return p.length < 64 ? 'l' : p.length > 256 ? 'h' : 'm';
};

class ExecutionSession {
  subSessionQueue: ExecutionSession[];
  breakPromptForExeErr = false;
  constructor(
    public id: number,
    public promptQueue: Prompt[],
    private run: PromptRun,
    public parent?: ExecutionSession,
  ) {
    this.subSessionQueue = [];
  }
  async *exec(): AsyncGenerator<
    string | symbol | WireActionWithWait,
    void,
    void
  > {
    console.log('Prompt start:', this.promptQueue[0].goalPrompt);
    let requireScreenshot = false;
    const { run, promptQueue, id } = this;
    const { tab, executionSession, args, actions, browserActionLock } = run;
    let { url } = tab;
    let stepsStream: AsyncGenerator<
      WireActionWithWait | WireSubTask,
      ExecutorLlmResult,
      void
    >;
    const finish = run.setRunningStatus(this);
    if (promptQueue.length === 0) {
      yield* this.execSubSessionQueue();
      finish();
      return;
    }
    while (promptQueue.length) {
      if (run.stopRequested) {
        finish();
        return;
      }
      const promptItem = promptQueue.shift()!;
      const {
        subPrompt: runSubPrompt,
        goalPrompt: runGoalPrompt,
        id: promptId,
        complexity,
      } = promptItem;
      const start = Date.now();
      try {
        stepsStream = executionSession.execPrompt(
          runGoalPrompt,
          args,
          runSubPrompt &&
            runSubPrompt.includes(`[performed actions]
-`)
            ? runSubPrompt.replace(
                `[performed actions]
-`,
                `[performed actions]
- ${actions.map((s) => s.intent).join('\n- ')}`,
              )
            : runSubPrompt,
          requireScreenshot,
          complexity,
        );

        let res:
          | IteratorYieldResult<WireActionWithWait | WireSubTask>
          | IteratorReturnResult<ExecutorLlmResult>;
        while ((res = await stepsStream.next())) {
          if (run.stopRequested) {
            finish();
            return;
          }
          if (res.done) {
            if (run.fixingAction?.promptId === promptId) {
              console.log('Fixing action done');
              run.fixingAction = null;
              run.execActions();
            }
            console.log(Date.now() - start, 'Waiting for complete prompt');
            // todo fix error sometimes block here
            await browserActionLock.wait;
            if (run.stopRequested) {
              finish();
              return;
            }

            yield* this.execSubSessionQueue();
            if (run.stopRequested) {
              finish();
              return;
            }

            if (res.value.todo) {
              console.log('Waiting for potential page load');
              await Promise.race([Util.sleep(2000), tab.pageLoadedLock.wait]);
              if (run.stopRequested) {
                finish();
                return;
              }
              if (tab.url === url) {
                yield PlanAfterRerender;
                console.log(Date.now() - start, 'Waiting for page re-render');
                await Network.waitForNetworkIdle0(
                  tab.networkIdle0,
                  tab.networkIdle2,
                ).then(() => Util.sleep(1000));
              } else {
                yield PlanAfterNavigation;
                console.log(
                  Date.now() - start,
                  'Waiting for page to load:',
                  url,
                );
                await tab.pageLoadedLock.wait;
                executionSession.resetSystemPrompt();
              }
              if (run.stopRequested) {
                finish();
                return;
              }
              if (this.breakPromptForExeErr) {
                console.log(
                  Date.now() - start,
                  'break prompting for exe err todo',
                );
                this.breakPromptForExeErr = false;
                break;
              }
              url = tab.url;
              requireScreenshot = res.value.todo.sc ?? false;
              const subPrompt = `**todo from last executor maybe wrong as page state changed, adjust if it conflict with the [goal]**
${res.value.todo.rc}

[performed actions]
-
`;
              const newPrompt = run.createPrompt(
                runGoalPrompt,
                {},
                id,
                estimatePromptComplexity(runGoalPrompt + subPrompt),
                subPrompt,
              );

              promptQueue.push(newPrompt);
              console.log(
                Date.now() - start,
                'push todo:',
                newPrompt.id,
                promptQueue,
              );
            }
            break;
          } else {
            if (this.breakPromptForExeErr) {
              console.log(Date.now() - start, 'break prompting for exe err');
              this.breakPromptForExeErr = false;
              break;
            }
            if ((res.value as WireActionWithWait).intent) {
              console.log(Date.now() - start, 'exec actions:', res.value);
              run.addAction({
                ...(res.value as WireActionWithWait),
                promptId,
                id: run.allocActionId(),
              });
              run.execActions();
              yield res.value as WireActionWithWait;
            } else {
              console.log(Date.now() - start, 'exec add sub task:', res.value);
              const newPrompt = run.createPrompt(
                `${(res.value as WireSubTask).subTaskPrompt}
**do not add subtask**`,
                (res.value as WireSubTask).addArgs ?? undefined,
                id,
                (res.value as WireSubTask).complexity,
              );
              this.addNewSubSession([newPrompt]);
            }
          }
        }
      } catch (e) {
        console.error('Error in exec prompt:', e);
        finish();
        throw e;
      }
      console.log(Date.now() - start, 'exec done', this.promptQueue.length);
    }
    finish();
  }
  async *execSubSessionQueue() {
    const { subSessionQueue } = this;
    const finished = [];
    while (subSessionQueue.length) {
      const subSession = subSessionQueue.shift()!;
      yield* subSession.exec();
      finished.push(subSession);
    }
    subSessionQueue.push(...finished);
  }
  addNewSubSession(queue: Prompt[]) {
    this.subSessionQueue.push(this.run.createSession(queue, this));
  }
}

class PromptRun {
  executionSession: ExecutionPrompter;
  args: Record<string, any> = {};
  actions: WireActionWithWaitAndRec[] = [];
  currentAction = 0;
  browserActionLock = Util.newLock('browserActionLock');
  browserActionLockOk = false;
  prompts: Prompt[] = [];
  rootSession: ExecutionSession;
  sessionQueue: ExecutionSession[] = [];
  runningSession: ExecutionSession[] = [];

  stopRequested = false;
  constructor(
    private manager: WebViewLlmSession,
    public tab: TabWebView,
    public requestId: number,
  ) {
    this.executionSession = new ExecutionPrompter(tab);
    this.rootSession = new ExecutionSession(0, [], this);

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
  async *initPrompt(
    promptTxt: string,
    args?: Record<string, string>,
    reasoningEffort?: LlmApi.ReasoningEffort,
    modelType?: LlmApi.LlmModelType,
  ): AsyncGenerator<string, void, void> {
    this.stopRequested = false;

    // todo check stage prompt to correct session
    const { rootSession } = this;
    if (true) {
      const prompt: Prompt = this.createPrompt(promptTxt, args, 0, 'l');
      rootSession.promptQueue.push(prompt);
      const stream = rootSession.exec();
      let streamChunk;
      let returnStr;
      while ((streamChunk = await stream.next())) {
        if (this.stopRequested) break;
        if (!streamChunk.done) {
          switch (typeof streamChunk.value) {
            case 'object':
              switch (streamChunk.value.risk) {
                case 'h':
                  returnStr = `High risk: ${streamChunk.value.intent}`;
                  break;
                case 'm':
                  returnStr = `Medium risk: ${streamChunk.value.intent}`;
                  break;
                default:
                  returnStr = streamChunk.value.intent ?? '';
                  break;
              }
              yield returnStr;
              break;
            case 'symbol':
              if (streamChunk.value === PlanAfterNavigation) {
                yield 'Wait for navigating to a new page';
              } else if (streamChunk.value === PlanAfterRerender) {
                yield 'Wait for rerender the page';
              }
              break;
            default:
              yield streamChunk.value;
              break;
          }
        } else {
          break;
        }
      }
    }
  }

  breakPromptForExeErr = false;

  stop() {
    this.stopRequested = true;
    this.fixingAction = null;
    this.browserActionLock.unlock();
  }

  allocActionId() {
    return this.manager.allocActionId(this.requestId);
  }

  getNextAction(): WireActionWithWaitAndRec | undefined {
    return this.actions[this.currentAction];
  }

  async execActions() {
    if (!this.fixingAction) {
      this.browserActionLockOk = false;
      this.manager.ensureRunLocked(this.requestId);
      this.manager.enqueueRun(this.requestId);
    }
  }

  getRemainActions(): WireActionWithWaitAndRec[] {
    const actions = this.actions.slice(this.currentAction);
    return actions;
  }

  addAction(action: WireActionWithWaitAndRec) {
    if (this.fixingAction) {
      const { fixingAction } = this;
      if (fixingAction!.offset === 0) {
        this.actions[fixingAction!.offset + this.currentAction] = action;
      } else {
        this.actions.splice(
          fixingAction!.offset + this.currentAction,
          0,
          action,
        );
      }
      fixingAction!.offset++;
      return;
    }
    this.actions.push(action);
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
    if (this.stopRequested) return;
    if (this.currentAction < this.actions.length) {
      this.execActions();
    } else {
      this.browserActionLock.delayUnlock(500);
    }
  }

  actionError(actionId: number, error: string) {
    if (this.actions.length === 0) return;
    const currentAction = this.actions[this.currentAction];
    console.log('Action error:', actionId, error, currentAction);
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

  fixingAction: {
    action: WireActionWithWaitAndRec;
    offset: number;
    promptId: number;
  } | null = null;
  async fixAction() {
    const actionToFix = this.actions[this.currentAction];
    if (actionToFix.error && actionToFix.error.length >= ExecutionMaxRetry) {
      console.log('Too many error, skip fixing');
      this.breakPromptForExeErr = true;
      return;
    }
    console.log('Try fix error:', actionToFix);

    const { sessionId } = this.prompts[actionToFix.promptId!];

    if (sessionId) {
      const session = this.sessionQueue[sessionId];
      const selectedPrompt = this.prompts[actionToFix.promptId!];
      if (!selectedPrompt) {
        console.error('Selected prompt not found:', actionToFix.promptId);
        return;
      }
      const goalPrompt = selectedPrompt.goalPrompt;
      const prompt = this.createPrompt(
        goalPrompt,
        undefined,
        sessionId,
        'h',
        `**fix the execution error in [action error]**

[action error]
${JSON.stringify(actionToFix)}${
          this.actions.length > this.currentAction + 1
            ? `

[planed actions]
- ${this.actions
                .slice(this.currentAction + 1)
                .map((a) => a.intent)
                .join('\n- ')}

these actions are blocking by this error, if you found any of the above actions will affected by the fix, press LlmWireResult.clearQueue: true in result and send the new actions.`
            : ''
        }`,
      );
      session.promptQueue.unshift(prompt);
      this.fixingAction = {
        action: actionToFix,
        offset: 0,
        promptId: prompt.id,
      };

      this.browserActionLock.unlock();
    }
  }

  createSession(
    queue: Prompt[],
    parent: ExecutionSession | undefined = undefined,
  ) {
    const session = new ExecutionSession(0, queue, this, parent);
    const sessionId = this.sessionQueue.push(session) - 1;
    session.id = sessionId;
    queue.forEach((p) => {
      p.sessionId = sessionId;
    });
    return session;
  }

  createPrompt(
    goalPrompt: string,
    argsAdded: Record<string, string> | undefined = undefined,
    sessionId: number | undefined = undefined,
    complexity: RiskOrComplexityLevel | undefined = undefined,
    subPrompt: string | undefined = undefined,
  ): Prompt {
    const prompt: Prompt = {
      id: 0,
      sessionId,
      goalPrompt,
      subPrompt,
      argsAdded,
      complexity:
        complexity ??
        estimatePromptComplexity(`${goalPrompt} ${subPrompt ?? ''}`),
    };
    prompt.id = this.prompts.push(prompt) - 1;
    if (argsAdded) {
      this.args = { ...this.args, ...argsAdded };
    }

    return prompt;
  }

  setRunningStatus(session: ExecutionSession) {
    this.runningSession.unshift(session);
    return () => {
      this.runningSession = this.runningSession.slice(
        this.runningSession.indexOf(session),
        this.runningSession.length,
      );
    };
  }
}

export class WebViewLlmSession {
  private runsByRequestId = new Map<number, PromptRun>();
  private runQueue: number[] = [];
  private activeRequestId: number | null = null;
  private inFlightAction = false;
  private actionIdToRequestId = new Map<number, number>();
  private nextActionId = 0;
  private lastStartedRequestId: number | null = null;

  constructor(public tab: TabWebView) {}

  startPrompt(
    requestId: number,
    promptTxt: string,
    args?: Record<string, string>,
    reasoningEffort?: LlmApi.ReasoningEffort,
    modelType?: LlmApi.LlmModelType,
  ) {
    const existing = this.runsByRequestId.get(requestId);
    if (existing) existing.stop();

    const run = new PromptRun(this, this.tab, requestId);
    this.runsByRequestId.set(requestId, run);
    this.lastStartedRequestId = requestId;
    return run.initPrompt(promptTxt, args, reasoningEffort, modelType);
  }

  stopPrompt(requestId?: number) {
    const id = requestId ?? this.lastStartedRequestId;
    if (id === null) return { stopped: false, error: 'No prompt to stop' };
    const run = this.runsByRequestId.get(id);
    if (!run) return { stopped: false, error: 'Prompt not found' };

    run.stop();
    this.runsByRequestId.delete(id);
    this.runQueue = this.runQueue.filter((v) => v !== id);
    if (this.activeRequestId === id) {
      this.activeRequestId = null;
      this.inFlightAction = false;
    }
    this.cleanupActionMapForRequest(id);
    this.pump();
    return { stopped: true };
  }

  resumeAll() {
    for (const [requestId, run] of this.runsByRequestId.entries()) {
      if (!run.stopRequested && run.getNextAction()) {
        this.ensureRunLocked(requestId);
        this.enqueueRun(requestId);
      }
    }
  }

  allocActionId(requestId: number) {
    const actionId = this.nextActionId++;
    this.actionIdToRequestId.set(actionId, requestId);
    return actionId;
  }

  ensureRunLocked(requestId: number) {
    const run = this.runsByRequestId.get(requestId);
    if (!run || run.stopRequested) return;
    if (run.browserActionLock.tryLock()) {
      run.browserActionLock.wait
        .then(() => {
          if (this.activeRequestId === requestId) {
            this.activeRequestId = null;
            this.inFlightAction = false;
          }
          this.pump();
        })
        .catch((err) => {
          console.error('Error waiting for browser action lock:', err);
        });
    }
  }

  enqueueRun(requestId: number) {
    if (!this.runsByRequestId.has(requestId)) return;
    if (this.activeRequestId === requestId) {
      this.pump();
      return;
    }
    if (!this.runQueue.includes(requestId)) {
      this.runQueue.push(requestId);
    }
    this.pump();
  }

  actionDone(actionId: number, argsDelta: Record<string, string> | undefined) {
    const requestId = this.actionIdToRequestId.get(actionId);
    if (requestId === undefined) return;
    const run = this.runsByRequestId.get(requestId);
    if (!run) return;
    run.actionDone(actionId, argsDelta);
    if (this.activeRequestId === requestId) {
      this.inFlightAction = false;
      this.pump();
    }
  }

  actionError(actionId: number, error: string) {
    const requestId = this.actionIdToRequestId.get(actionId);
    if (requestId === undefined) return;
    const run = this.runsByRequestId.get(requestId);
    if (!run) return;
    run.actionError(actionId, error);
    if (this.activeRequestId === requestId) {
      this.inFlightAction = false;
      this.pump();
    }
  }

  private pump() {
    if (this.activeRequestId !== null) {
      if (this.inFlightAction) return;
      const run = this.runsByRequestId.get(this.activeRequestId);
      if (!run || run.stopRequested) {
        this.activeRequestId = null;
        this.inFlightAction = false;
        this.pump();
        return;
      }
      const nextAction = run.getNextAction();
      if (!nextAction) return;
      this.inFlightAction = true;
      this.tab.pushActions([nextAction], run.args);
      return;
    }

    while (this.runQueue.length) {
      const requestId = this.runQueue.shift()!;
      const run = this.runsByRequestId.get(requestId);
      if (!run || run.stopRequested) continue;
      const nextAction = run.getNextAction();
      if (!nextAction) continue;

      this.activeRequestId = requestId;
      this.inFlightAction = true;
      this.tab.pushActions([nextAction], run.args);
      return;
    }
  }

  private cleanupActionMapForRequest(requestId: number) {
    for (const [actionId, owner] of this.actionIdToRequestId.entries()) {
      if (owner === requestId) this.actionIdToRequestId.delete(actionId);
    }
  }
}
