import { estimatePromptComplexity } from '../utils/llm';
import { Network } from '../webView/network';
import { Util } from '../webView/util';
import { PlanAfterNavigation, PlanAfterRerender } from './constants';
import {
  ExecutorLlmResult,
  WireActionWithWait,
  WireSubTask,
} from './execution.schema';
import { PromptRun } from './promptRun';
import { Prompt, WireActionWithWaitAndRec } from './types';
import { LlmApi } from './api';
import { CommonUtil } from '../utils/common';

// LlmApi.addDummyReturn(
//   JSON.stringify({
//     taskEstimate: {
//       doableInCurrentHtml:
//         'Fill email, fill password, submit sign-in (3 short actions).',
//       shouldGoTodo:
//         'After sign-in, check inbox for new order email, extract order details, open POS, create order, preview, handle >1000 checks, download invoice, reply email.',
//     },
//     a: [
//       {
//         intent: 'fill in email with provided credential pikachu@pokemon.com',
//         risk: 'm',
//         action: {
//           k: 'input',
//           q: '___2',
//           v: 'pikachu@pokemon.com',
//         },
//       },
//       {
//         intent: 'fill in password with provided credential P@ssword321',
//         risk: 'm',
//         action: {
//           k: 'input',
//           q: '___5',
//           v: 'P@ssword321',
//         },
//       },
//       {
//         intent: 'submit the sign-in form by clicking Next',
//         risk: 'm',
//         action: {
//           k: 'mouse',
//           a: 'click',
//           q: '___c',
//         },
//       },
//     ],
//     todo: {
//       rc: "After sign-in completes, check the email inbox for a new order message, extract the order details (items, qty, prices, customer info). Then open the POS (runever://benchmark/#/pos), create the order using extracted details, preview the order. If order total > 1000, capture a screenshot of preview and send order details plus screenshot to messenger (runever://benchmark/#/im) requesting manager Dillon's approval. Follow Dillon's advice. After final submit, go to order list, download the invoice, then return to email and reply to the client. Keep using the same credentials.",
//       sc: false,
//     },
//   } as ExecutorLlmResult),
// );
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
const NoNestSubtaskPrompt =
  '**running a subtask, do not add subtask, if the task on the current UI should split, end this subtask with finishedNoToDo and shortly < 10words advise in subtaskResp**';
export class ExecutionSession {
  subSessionQueue: ExecutionSession[];
  actions: WireActionWithWaitAndRec[] = [];
  breakPromptForExeErr = false;
  eventsLogs: string[] = [];
  attachmentInNextTodo: string[] = [];
  response: string | undefined = undefined;
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
    const { run, id, eventsLogs, parent } = this;
    let { promptQueue } = this;
    if (run.fixingAction.length === 0 && this.promptQueue.length === 0) {
      yield* this.execSubSessionQueue();
      return;
    }
    console.log(
      'Prompt start:',
      this.promptQueue[0]?.goalPrompt ?? 'no prompt',
    );
    let retry = 3;
    let requireScreenshot = false;
    const { tab, executionSession, browserActionLock, manager } = run;
    let { url } = tab;
    let stepsStream: AsyncGenerator<
      WireActionWithWait | WireSubTask,
      ExecutorLlmResult | undefined,
      void
    >;
    const finish = run.setRunningStatus(this);
    if (run.fixingAction.length === 0 && promptQueue.length === 0) {
      const res = yield* this.execSubSessionQueue();
      finish();
      return res;
    }
    // eslint-disable-next-line no-labels
    promptQueueLoop: while (promptQueue.length) {
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
        attachments,
      } = promptItem;
      const start = Date.now();
      try {
        console.log(eventsLogs);
        stepsStream = executionSession.execPrompt(
          runGoalPrompt,
          run.args,
          runSubPrompt &&
            runSubPrompt.includes(`[performed actions]
-`)
            ? runSubPrompt.replace(
                `[performed actions]
-`,
                `[performed actions]
- ${eventsLogs.join('\n- ')}`,
              )
            : runSubPrompt,
          requireScreenshot,
          complexity,
          attachments,
        );

        let res:
          | IteratorYieldResult<WireActionWithWait | WireSubTask>
          | IteratorReturnResult<ExecutorLlmResult | undefined>;
        while ((res = await stepsStream.next())) {
          if (run.stopRequested) {
            finish();
            return;
          }
          if (res.done) {
            if (
              res.value &&
              run.fixingAction.length &&
              run.fixingAction[0]?.promptId === promptId
            ) {
              if (
                !res.value.todo &&
                res.value.a.length === 1 &&
                (res.value.a[0] as WireActionWithWait).intent
              ) {
                const fixingAct = run.fixingAction[0].action;
                fixingAct.intent = (
                  res.value.a[0] as WireActionWithWait
                ).intent;
                fixingAct.action = (
                  res.value.a[0] as WireActionWithWait
                ).action;
                fixingAct.risk = (res.value.a[0] as WireActionWithWait).risk;
                fixingAct.pre = (res.value.a[0] as WireActionWithWait).pre;
                fixingAct.post = (res.value.a[0] as WireActionWithWait).post;
                run.fixingAction.shift();
                console.log('Fixing action done replace');
              } else {
                // remove pending if todo exist
                this.removePendingActions();
                this.promptQueue = [];
                promptQueue = [];
                run.fixingAction.splice(0, run.fixingAction.length);
                res.value.a.forEach((a) => {
                  if ((a as WireActionWithWait).intent) {
                    this.addAction({
                      ...(a as WireActionWithWait),
                      promptId,
                      id: run.allocActionId(),
                    });
                  }
                });
                console.log('Fixing action done clear');
              }
              run.execActions();
            }
            console.log(Date.now() - start, 'Waiting for complete prompt');
            // todo fix error sometimes block here
            await browserActionLock.wait;
            if (run.stopRequested) {
              console.log('Stop requested');
              finish();
              return;
            }

            if (run.fixingAction.length === 0 && this.subSessionQueue.length) {
              if (this.subSessionQueue.length === 1 && res.value) {
                // prevent llm adding single subtask
                const subTaskToMerge = this.subSessionQueue.shift()!;
                if (res.value.todo) {
                  res.value.todo.rc =
                    subTaskToMerge?.promptQueue[0].goalPrompt.replace(
                      NoNestSubtaskPrompt,
                      `${res.value.todo.rc}\n${NoNestSubtaskPrompt}`,
                    );
                } else {
                  res.value.todo = {
                    rc: subTaskToMerge?.promptQueue[0].goalPrompt,
                  };
                }
                console.log('merge single subtask to todo', res.value.todo.rc);
              } else {
                console.log('Run sub session queue');
                yield* this.execSubSessionQueue();
              }
            }

            if (run.stopRequested) {
              finish();
              return;
            }
            const newTabUrl = manager.getFocusedTab()?.url ?? tab.url;
            console.log('url compare', url, newTabUrl, parent);
            if (url !== newTabUrl) {
              if (parent) {
                // end subtask when url change to avoid long tail subtask

                this.response = `url changed, end subtask, remain todo: ${res.value?.todo?.rc ?? ''}`;
                console.log(
                  'url changed, end subtask',
                  url,
                  newTabUrl,
                  this.response,
                );
                // eslint-disable-next-line no-labels
                break promptQueueLoop;
              }
            }

            if (res.value?.todo) {
              yield* this.waitPageReady(url, start);
              executionSession.resetSystemPrompt();
              if (res.value.todo.descAttachment) {
                res.value.todo.descAttachment.forEach((f) => {
                  const ff = run.manager.readableFiles.get(f.name);
                  if (ff) {
                    ff.desc = f.desc;
                  }
                });
              }
              if (run.stopRequested) {
                finish();
                return;
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
              url = newTabUrl;
              requireScreenshot = res.value.todo.sc ?? false;
              const subPrompt = `**todo from last executor maybe outdated as page state changed, stick to the [goal] and current [HTML] page status**
${res.value.todo.rc}

[performed actions]
-
`;
              const toAttach = res.value.todo.readFiles ?? [];
              if (this.attachmentInNextTodo.length) {
                toAttach.push(...this.attachmentInNextTodo);
                this.attachmentInNextTodo = [];
              }
              const newPrompt = run.createPrompt(
                runGoalPrompt,
                {},
                id,
                estimatePromptComplexity(runGoalPrompt + subPrompt),
                subPrompt,
                toAttach,
              );

              promptQueue.push(newPrompt);
              console.log(
                Date.now() - start,
                'push todo:',
                newPrompt.id,
                promptQueue,
              );
            } else if (
              run.fixingAction.length === 0 &&
              res.value?.subtaskResp
            ) {
              this.response = res.value.subtaskResp;
              // eslint-disable-next-line no-labels
              break promptQueueLoop;
            }
            break;
          }
          if (this.breakPromptForExeErr) {
            console.log(Date.now() - start, 'break prompting for exe err');
            this.breakPromptForExeErr = false;
            break;
          }
          if ((res.value as WireActionWithWait).intent) {
            if (!run.fixingAction.length) {
              const act = res.value as WireActionWithWait;
              console.log(Date.now() - start, 'exec actions:', res.value);
              this.addAction({
                ...act,
                promptId,
                id: run.allocActionId(),
              });
              run.execActions();

              yield res.value as WireActionWithWait;
            }
          } else {
            if (parent) {
              throw new Error('Nested subtask not supported yet');
            }
            console.log(Date.now() - start, 'exec add sub task:', res.value);
            const newPrompt = run.createPrompt(
              `${(res.value as WireSubTask).subTaskPrompt}
${NoNestSubtaskPrompt}

[master goal]
**for reference only not action, in case of conflict with above goal, use setArg to return error to parent session and end yours**
${runGoalPrompt}`,
              (res.value as WireSubTask).addArgs ?? undefined,
              id,
              (res.value as WireSubTask).complexity,
            );
            this.addNewSubSession([newPrompt]);
            if ((res.value as WireSubTask).addArgs) {
              Object.entries((res.value as WireSubTask).addArgs!).forEach(
                ([k, v]) => {
                  const vv = CommonUtil.replaceJsTpl(v, run.args);
                  if (vv === undefined) {
                    return;
                  }
                  if (vv.startsWith('[') || vv.startsWith('{')) {
                    try {
                      const vvv = CommonUtil.flattenArgs(JSON.parse(vv));
                      Object.assign(run.args, vvv);
                    } catch (e) {
                      console.warn(e);
                      run.args[k] = vv;
                    }
                  } else {
                    run.args[k] = vv;
                  }
                },
              );
            }
          }
        }
      } catch (e) {
        console.error('Error in exec prompt:', e);
        if (retry === 0) {
          finish();
        }
        retry--;
        promptQueue.unshift(
          run.createPrompt(
            runGoalPrompt,
            undefined,
            id,
            'l',
            `Fix return error: ${e instanceof Error ? e.message : ''} ${JSON.stringify(e)}`,
          ),
        );
      }
      console.log(Date.now() - start, 'exec done', this.promptQueue.length);
      retry = 3;
    }
    finish();
  }
  async *waitPageReady(url: string, start = Date.now()) {
    const { tab } = this.run;
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
    const {
      subSessionQueue,
      run: { manager, tab },
    } = this;
    const { url } = tab;
    while (subSessionQueue.length) {
      const subSession = subSessionQueue.shift()!;
      const prompt = subSession.promptQueue[0];
      const goal = (prompt.goalPrompt ?? '').split(
        `\n${NoNestSubtaskPrompt}`,
      )[0];
      if (url === manager.getFocusedTab()?.url) {
        yield* subSession.exec();
        this.addLog(`${goal ?? ''}:${subSession.response ?? ''}`);
      } else {
        this.addLog(`${goal ?? ''}:skip as url changed`);
      }
    }
  }
  addNewSubSession(queue: Prompt[]) {
    this.subSessionQueue.push(this.run.createSession(queue, this));
  }
  addAction(action: WireActionWithWaitAndRec) {
    this.actions.push(action);
    this.run.addAction(action);
  }
  removePendingActions() {
    this.actions = this.actions.filter((a) => !!a.done);
    this.run.removePendingActions();
  }
  addLog(log: string) {
    this.eventsLogs.push(log);
  }
}
