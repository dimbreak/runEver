import fs from 'fs';
import { app } from 'electron';
import { type } from 'node:os';
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
import { replaceJsTpl } from '../webView/selector';

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

LlmApi.addDummyReturn(
  '{\n  "shouldSplitTask": "no split needed — single straightforward interaction inside the iframe",\n  "a": [\n    {\n      "intent": "fill the iframe search box with \'openai\'",\n      "risk": "l",\n      "action": {\n        "k": "input",\n        "q": {\n          "id": "__45:APjFqb",\n          "argKeys": []\n        },\n        "v": "openai"\n      }\n    },\n    {\n      "intent": "click the Google Search button in the iframe to perform the search",\n      "risk": "l",\n      "action": {\n        "k": "mouse",\n        "a": "click",\n        "q": {\n          "id": "__45:1r",\n          "argKeys": []\n        }\n      }\n    }\n  ]\n}',
);
LlmApi.addDummyReturn(
  '{\n  "shouldSplitTask": "no split needed — single straightforward interaction inside the iframe",\n  "a": [\n    {\n      "intent": "fill the iframe search box with \'openai\'",\n      "risk": "l",\n      "action": {\n        "k": "input",\n        "q": {\n          "id": "__45:APjFqb",\n          "argKeys": []\n        },\n        "v": "openai"\n      }\n    },\n    {\n      "intent": "click the Google Search button in the iframe to perform the search",\n      "risk": "l",\n      "action": {\n        "k": "mouse",\n        "a": "click",\n        "q": {\n          "id": "__45:1r",\n          "argKeys": []\n        }\n      }\n    }\n  ]\n}',
);
LlmApi.addDummyReturn(
  '{\n  "shouldSplitTask": "no split needed — single straightforward interaction inside the iframe",\n  "a": [\n    {\n      "intent": "fill the iframe search box with \'openai\'",\n      "risk": "l",\n      "action": {\n        "k": "input",\n        "q": {\n          "id": "__45:APjFqb",\n          "argKeys": []\n        },\n        "v": "openai"\n      }\n    },\n    {\n      "intent": "click the Google Search button in the iframe to perform the search",\n      "risk": "l",\n      "action": {\n        "k": "mouse",\n        "a": "click",\n        "q": {\n          "id": "__45:1r",\n          "argKeys": []\n        }\n      }\n    }\n  ]\n}',
);
LlmApi.addDummyReturn(
  '{\n  "shouldSplitTask": "no split needed — single straightforward interaction inside the iframe",\n  "a": [\n    {\n      "intent": "fill the iframe search box with \'openai\'",\n      "risk": "l",\n      "action": {\n        "k": "input",\n        "q": {\n          "id": "__45:APjFqb",\n          "argKeys": []\n        },\n        "v": "openai"\n      }\n    },\n    {\n      "intent": "click the Google Search button in the iframe to perform the search",\n      "risk": "l",\n      "action": {\n        "k": "mouse",\n        "a": "click",\n        "q": {\n          "id": "__45:1r",\n          "argKeys": []\n        }\n      }\n    }\n  ]\n}',
);
LlmApi.addDummyReturn(
  '{\n  "shouldSplitTask": "no split needed — single straightforward interaction inside the iframe",\n  "a": [\n    {\n      "intent": "fill the iframe search box with \'openai\'",\n      "risk": "l",\n      "action": {\n        "k": "input",\n        "q": {\n          "id": "__45:APjFqb",\n          "argKeys": []\n        },\n        "v": "openai"\n      }\n    },\n    {\n      "intent": "click the Google Search button in the iframe to perform the search",\n      "risk": "l",\n      "action": {\n        "k": "mouse",\n        "a": "click",\n        "q": {\n          "id": "__45:1r",\n          "argKeys": []\n        }\n      }\n    }\n  ]\n}',
);
LlmApi.addDummyReturn(
  '{\n  "shouldSplitTask": "no split needed — single straightforward interaction inside the iframe",\n  "a": [\n    {\n      "intent": "fill the iframe search box with \'openai\'",\n      "risk": "l",\n      "action": {\n        "k": "input",\n        "q": {\n          "id": "__45:APjFqb",\n          "argKeys": []\n        },\n        "v": "openai"\n      }\n    },\n    {\n      "intent": "click the Google Search button in the iframe to perform the search",\n      "risk": "l",\n      "action": {\n        "k": "mouse",\n        "a": "click",\n        "q": {\n          "id": "__45:1r",\n          "argKeys": []\n        }\n      }\n    }\n  ]\n}',
);
LlmApi.addDummyReturn(
  '{\n  "shouldSplitTask": "no split needed — single straightforward interaction inside the iframe",\n  "a": [\n    {\n      "intent": "fill the iframe search box with \'openai\'",\n      "risk": "l",\n      "action": {\n        "k": "input",\n        "q": {\n          "id": "__45:APjFqb",\n          "argKeys": []\n        },\n        "v": "openai"\n      }\n    },\n    {\n      "intent": "click the Google Search button in the iframe to perform the search",\n      "risk": "l",\n      "action": {\n        "k": "mouse",\n        "a": "click",\n        "q": {\n          "id": "__45:1r",\n          "argKeys": []\n        }\n      }\n    }\n  ]\n}',
);
LlmApi.addDummyReturn(
  '{\n  "shouldSplitTask": "no split needed — single straightforward interaction inside the iframe",\n  "a": [\n    {\n      "intent": "fill the iframe search box with \'openai\'",\n      "risk": "l",\n      "action": {\n        "k": "input",\n        "q": {\n          "id": "__45:APjFqb",\n          "argKeys": []\n        },\n        "v": "openai"\n      }\n    },\n    {\n      "intent": "click the Google Search button in the iframe to perform the search",\n      "risk": "l",\n      "action": {\n        "k": "mouse",\n        "a": "click",\n        "q": {\n          "id": "__45:1r",\n          "argKeys": []\n        }\n      }\n    }\n  ]\n}',
);
LlmApi.addDummyReturn(
  '{\n  "shouldSplitTask": "no split needed — single straightforward interaction inside the iframe",\n  "a": [\n    {\n      "intent": "fill the iframe search box with \'openai\'",\n      "risk": "l",\n      "action": {\n        "k": "input",\n        "q": {\n          "id": "__45:APjFqb",\n          "argKeys": []\n        },\n        "v": "openai"\n      }\n    },\n    {\n      "intent": "click the Google Search button in the iframe to perform the search",\n      "risk": "l",\n      "action": {\n        "k": "mouse",\n        "a": "click",\n        "q": {\n          "id": "__45:1r",\n          "argKeys": []\n        }\n      }\n    }\n  ]\n}',
);
LlmApi.addDummyReturn(
  '{\n  "shouldSplitTask": "no split needed — single straightforward interaction inside the iframe",\n  "a": [\n    {\n      "intent": "fill the iframe search box with \'openai\'",\n      "risk": "l",\n      "action": {\n        "k": "input",\n        "q": {\n          "id": "__45:APjFqb",\n          "argKeys": []\n        },\n        "v": "openai"\n      }\n    },\n    {\n      "intent": "click the Google Search button in the iframe to perform the search",\n      "risk": "l",\n      "action": {\n        "k": "mouse",\n        "a": "click",\n        "q": {\n          "id": "__45:1r",\n          "argKeys": []\n        }\n      }\n    }\n  ]\n}',
);
LlmApi.addDummyReturn(
  '{\n  "shouldSplitTask": "no split needed — single straightforward interaction inside the iframe",\n  "a": [\n    {\n      "intent": "fill the iframe search box with \'openai\'",\n      "risk": "l",\n      "action": {\n        "k": "input",\n        "q": {\n          "id": "__45:APjFqb",\n          "argKeys": []\n        },\n        "v": "openai"\n      }\n    },\n    {\n      "intent": "click the Google Search button in the iframe to perform the search",\n      "risk": "l",\n      "action": {\n        "k": "mouse",\n        "a": "click",\n        "q": {\n          "id": "__45:1r",\n          "argKeys": []\n        }\n      }\n    }\n  ]\n}',
);
LlmApi.addDummyReturn(
  '{\n  "shouldSplitTask": "no split needed — single straightforward interaction inside the iframe",\n  "a": [\n    {\n      "intent": "fill the iframe search box with \'openai\'",\n      "risk": "l",\n      "action": {\n        "k": "input",\n        "q": {\n          "id": "__45:APjFqb",\n          "argKeys": []\n        },\n        "v": "openai"\n      }\n    },\n    {\n      "intent": "click the Google Search button in the iframe to perform the search",\n      "risk": "l",\n      "action": {\n        "k": "mouse",\n        "a": "click",\n        "q": {\n          "id": "__45:1r",\n          "argKeys": []\n        }\n      }\n    }\n  ]\n}',
);
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
  actions: WireActionWithWaitAndRec[] = [];
  breakPromptForExeErr = false;
  constructor(
    public id: number,
    public promptQueue: Prompt[],
    private wvSession: WebViewLlmSession,
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
    const { wvSession, promptQueue, id, actions, subSessionQueue } = this;
    const { tab, executionPrompter, args, browserActionLock } = wvSession;
    let { url } = tab;
    let stepsStream: AsyncGenerator<
      WireActionWithWait | WireSubTask,
      ExecutorLlmResult | undefined,
      void
    >;
    const finish = wvSession.setRunningStatus(this);
    if (promptQueue.length === 0) {
      const res = yield* this.execSubSessionQueue();
      finish();
      return res;
    }
    while (promptQueue.length) {
      const promptItem = promptQueue.shift()!;
      const {
        subPrompt: runSubPrompt,
        goalPrompt: runGoalPrompt,
        id: promptId,
        complexity,
      } = promptItem;
      const start = Date.now();
      try {
        stepsStream = executionPrompter.execPrompt(
          runGoalPrompt,
          args,
          runSubPrompt &&
            runSubPrompt.includes(`[performed actions]
-`)
            ? runSubPrompt.replace(
                `[performed actions]
-`,
                `[performed actions]
- ${actions.map((s) => s.intent).join('\n- ')}${
                  subSessionQueue.length
                    ? `
- ${subSessionQueue
                        .filter((s) => !!s.promptQueue[0])
                        .map((s) => s.promptQueue[0]?.goalPrompt)
                        .join('\n- ')}`
                    : ''
                }`,
              )
            : runSubPrompt,
          requireScreenshot,
          complexity,
        );

        let res:
          | IteratorYieldResult<WireActionWithWait | WireSubTask>
          | IteratorReturnResult<ExecutorLlmResult | undefined>;
        while ((res = await stepsStream.next())) {
          if (res.done) {
            if (res.value && wvSession.fixingAction?.promptId === promptId) {
              console.log('Fixing action done');
              if (res.value.todo) {
                // remove pending if todo exist
                this.removePendingActions();
                this.promptQueue = [];
              }
              res.value.a.forEach((a) => {
                if ((a as WireActionWithWait).intent) {
                  this.addAction({
                    ...(a as WireActionWithWait),
                    promptId,
                    id: wvSession.actionId++,
                  });
                }
              });
              wvSession.fixingAction = null;
              wvSession.execActions();
            }
            console.log(Date.now() - start, 'Waiting for complete prompt');
            // todo fix error sometimes block here
            await browserActionLock.wait;

            if (this.subSessionQueue.length) {
              console.log('Run sub session queue');
              yield* this.waitPageReady(url, start);
              await this.execSubSessionQueue();
            }
            if (res.value?.todo) {
              yield* this.waitPageReady(url, start);
              executionPrompter.resetSystemPrompt();
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
              const newPrompt = wvSession.createPrompt(
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
              if (
                wvSession.fixingAction === null ||
                wvSession.fixingAction?.promptId !== promptId
              ) {
                console.log(Date.now() - start, 'exec actions:', res.value);
                this.addAction({
                  ...(res.value as WireActionWithWait),
                  promptId,
                  id: wvSession.actionId++,
                });
                wvSession.execActions();
                yield res.value as WireActionWithWait;
              }
            } else {
              console.log(Date.now() - start, 'exec add sub task:', res.value);
              const newPrompt = wvSession.createPrompt(
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
  async *waitPageReady(url: string, start = Date.now()) {
    const { tab } = this.wvSession;
    console.log('Waiting for potential page load');
    await Promise.race([Util.sleep(2000), tab.pageLoadedLock.wait]);
    if (tab.url === url) {
      yield PlanAfterRerender;
      console.log(Date.now() - start, 'Waiting for page re-render');
      await Network.waitForNetworkIdle0(
        tab.networkIdle0,
        tab.networkIdle2,
      ).then(() => Util.sleep(1000));
    } else {
      yield PlanAfterNavigation;
      console.log(Date.now() - start, 'Waiting for page to load:', url);
      await tab.pageLoadedLock.wait;
    }
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
    this.subSessionQueue.push(this.wvSession.createSession(queue, this));
  }
  addAction(action: WireActionWithWaitAndRec) {
    if (action.action.k === 'setArg') {
      const kvs = Object.entries(action.action.kv);
      if (kvs.length > 1) {
        // split setArg from selector to different actions make webview easier
        action.action.kv = {};
        const actions = [];
        let action0HasId = false;
        for (const [k, v] of kvs) {
          if (typeof v === 'string') {
            action.action.kv[k] = v;
          } else if (!action0HasId) {
            action0HasId = true;
            action.action.kv[k] = v;
          } else {
            actions.push({
              ...action,
              id: this.wvSession.actionId++,
              action: { ...action.action, kv: { [k]: v } },
            });
          }
        }
        this.actions.push(action);
        this.wvSession.addAction(action);
        if (actions.length) {
          this.actions.push(...actions);
          actions.forEach((a) => this.wvSession.addAction(a));
        }
        return;
      }
    }
    this.actions.push(action);
    this.wvSession.addAction(action);
  }
  removePendingActions() {
    this.actions = this.actions.filter((a) => !!a.done);
    this.wvSession.removePendingActions();
  }
}

export class WebViewLlmSession {
  executionPrompter: ExecutionPrompter;
  args: Record<string, any> = {};
  actions: WireActionWithWaitAndRec[] = [];
  currentAction = 0;
  actionId = 0;
  browserActionLock = Util.newLock('browserActionLock');
  browserActionLockOk = false;
  prompts: Prompt[] = [];
  rootSession: ExecutionSession;
  sessionQueue: ExecutionSession[] = [];
  runningSession: ExecutionSession[] = [];
  constructor(public tab: TabWebView) {
    this.executionPrompter = new ExecutionPrompter(tab);
    this.rootSession = new ExecutionSession(0, [], this);
    this.sessionQueue.push(this.rootSession);

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
    // todo check stage prompt to correct session
    const { rootSession } = this;
    if (true) {
      const prompt: Prompt = this.createPrompt(promptTxt, args, 0, 'l');
      rootSession.promptQueue.push(prompt);
      const stream = rootSession.exec();
      let streamChunk;
      let returnStr;
      while ((streamChunk = await stream.next())) {
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

  async execActions() {
    if (!this.fixingAction) {
      this.browserActionLockOk = false;
      this.browserActionLock.tryLock();
      this.tab.pushActions();
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
    if (this.currentAction === this.actions.length) {
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

    const { sessionId } = this.prompts[actionToFix.promptId!];
    console.log('Try fix error:', actionToFix, sessionId);

    if (sessionId !== undefined) {
      const session = this.sessionQueue[sessionId];
      const selectedPrompt = this.prompts[actionToFix.promptId!];
      if (!selectedPrompt) {
        console.error('Selected prompt not found:', actionToFix.promptId);
        return;
      }
      const { goalPrompt } = selectedPrompt;
      const prompt = this.createPrompt(
        goalPrompt,
        undefined,
        sessionId,
        'h',
        `**fix the execution error in [action error]**
if the error is fixable itself, DO NOT SEND TODO or ACTIONS other then the error one.
sending todo while fixing prompt will clear the existing action & todo queue.
do not add subTask

[action error]
${JSON.stringify(actionToFix)}${
          this.actions.length > this.currentAction + 1
            ? `

[planed actions]
- ${this.actions
                .slice(this.currentAction + 1)
                .map((a) => a.intent)
                .join('\n- ')}

these actions are blocking by this error, if you found any of the above actions will affected by the fix, send todo to skip theses actions.`
            : ''
        }`,
      );
      console.log('Fixing action:', sessionId, prompt.id);
      session.promptQueue.unshift(prompt);
      this.fixingAction = {
        action: actionToFix,
        offset: 0,
        promptId: prompt.id,
      };

      this.browserActionLock.unlock();
    }
  }

  removePendingActions() {
    this.actions = this.actions.filter((a) => !!a.done);
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
      this.args = {
        ...this.args,
        ...Object.entries(argsAdded).reduce(
          (acc, [k, v]) => {
            acc[k] = replaceJsTpl(v, this.args);
            return acc;
          },
          {} as Record<string, string>,
        ),
      };
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
