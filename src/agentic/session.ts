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
//     a: [
//       {
//         intent:
//           'return title and add-to-basket id of product under ${args.maxPrice} with highest reviews',
//
//         risk: 'l',
//
//         action: {
//           k: 'setArg',
//
//           kv: { selectedTitle: 'Tech Item 15', addToBasketButtonId: '__5p' },
//         },
//       },
//     ],
//   } as ExecutorLlmResult),
// );
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
const NoNestSubtaskPrompt =
  '**running a subtask, do not add subtask, if the task on the current UI should split, end this subtask with finishedNoToDo and advise in subtaskResp**';
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
    const { run, promptQueue, id, eventsLogs, parent } = this;
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
    const { tab, executionSession, browserActionLock } = run;
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
                    id: run.allocActionId(),
                  });
                }
              });
              run.fixingAction.shift();
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
              console.log('Run sub session queue');
              yield* this.execSubSessionQueue();
            }

            if (run.stopRequested) {
              finish();
              return;
            }

            if (res.value?.todo) {
              yield* this.waitPageReady(url, start);
              if (url !== tab.url) {
                if (parent) {
                  // end subtask when url change to avoid long tail subtask

                  this.response = `url changed, end subtask, remain todo: ${res.value?.todo.rc ?? ''}`;
                  console.log(
                    'url changed, end subtask',
                    url,
                    tab.url,
                    this.response,
                  );
                  // eslint-disable-next-line no-labels
                  break promptQueueLoop;
                }
              }
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
              url = tab.url;
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
            } else if (res.value?.subtaskResp) {
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
            if (
              run.fixingAction.length ||
              run.fixingAction[0]?.promptId !== promptId
            ) {
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
      run: { tab },
    } = this;
    const { url } = tab;
    while (subSessionQueue.length) {
      const subSession = subSessionQueue.shift()!;
      const prompt = subSession.promptQueue[0];
      const goal = (prompt.goalPrompt ?? '').split(
        `\n${NoNestSubtaskPrompt}`,
      )[0];
      if (url === tab.url) {
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
              id: this.run.allocActionId(),
              action: { ...action.action, kv: { [k]: v } },
            });
          }
        }
        this.actions.push(action);
        this.run.addAction(action);
        if (actions.length) {
          this.actions.push(...actions);
          actions.forEach((a) => this.run.addAction(a));
        }
        return;
      }
    }
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
