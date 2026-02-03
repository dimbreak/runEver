import { estimatePromptComplexity } from '../utils/llm';
import { Network } from '../webView/network';
import { Util } from '../webView/util';
import { PlanAfterNavigation, PlanAfterRerender } from './constants';
import {
  ExecutorLlmResult,
  WireAction,
  WireActionWithWait,
  WireSubTask,
} from './execution.schema';
import { PromptRun } from './promptRun';
import { Prompt, WireActionWithWaitAndRec } from './types';
import { LlmApi } from './api';
import { SmartAction } from './profile/smartAction';
import { ExecutionPrompter } from './execution';

// LlmApi.addDummyReturn(
//   JSON.stringify({
//     a: [
//       {
//         intent: 'fill email and password fields',
//         risk: 'm',
//         action: {
//           k: 'fillForm',
//           q: '__e',
//           data: [
//             {
//               f: 'email',
//               v: 'pikachu@pokemon.com',
//             },
//             {
//               f: 'password',
//               v: '95279527',
//             },
//           ],
//         },
//       },
//       {
//         intent: 'click the Next submit button',
//         risk: 'm',
//         action: {
//           k: 'mouse',
//           a: 'click',
//           q: {
//             id: '__c',
//             argKeys: [],
//           },
//         },
//         post: {
//           t: 'network',
//           a: 'idle0',
//         },
//       },
//     ],
//     todo: 'finishedNoToDo',
//   }),
// );
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');

enum ExeSessTodoStatus {
  Todo = 0,
  Done = 1,
  Cancel = 2,
}

interface ExeSessTodo {
  todo: string;
  status: ExeSessTodoStatus;
}

const NoNestSubtaskPrompt =
  '**running a subtask, do not add subtask, if the task on the current UI should split, end this subtask with finishedNoToDo and shortly < 10words advise in subtaskResp**';
export class ExecutionSession {
  prompter: ExecutionPrompter;
  subSessionQueue: ExecutionSession[];
  actions: WireActionWithWaitAndRec[] = [];
  breakPromptForExeErr = false;
  eventsLogs: string[] = [];
  needFix: string[] = [];
  todos: ExeSessTodo[] = [];
  attachmentInNextTodo: string[] = [];
  response: string | undefined = undefined;
  constructor(
    public id: number,
    public promptQueue: Prompt[],
    public run: PromptRun,
    public parent?: ExecutionSession,
  ) {
    this.prompter = new ExecutionPrompter(run.manager);
    this.subSessionQueue = [];
  }
  async *exec(): AsyncGenerator<
    string | symbol | WireActionWithWait,
    void,
    void
  > {
    const { run, id, eventsLogs, parent, prompter, needFix, todos } = this;
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
    const { tab, browserActionLock, manager } = run;
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
    let tip = '';
    let toAttach: string[] = [];
    const promptItem = promptQueue.shift()!;
    // eslint-disable-next-line no-labels
    promptQueueLoop: while (promptItem) {
      if (run.stopRequested) {
        finish();
        return;
      }
      const {
        subPrompt: runSubPrompt,
        goalPrompt: runGoalPrompt,
        id: promptId,
        complexity,
        attachments,
      } = promptItem;
      const start = Date.now();
      try {
        stepsStream = prompter.execPrompt(
          runGoalPrompt,
          run.args,
          `[todo ${todos.filter((td) => td.status === ExeSessTodoStatus.Todo).length}/${todos.length}]
${todos.length ? todos.map((td, i) => `${i}:${td.todo}-${ExeSessTodoStatus[td.status]}\n`) : '**you are first executor**, you must use todo action to split the prompt unless you can finish it in few actions'}${
            tip
              ? `

[tip from last executor]
**todo from last executor maybe outdated as page state changed, stick to the [goal] and current [HTML] page status**
${tip}
`
              : ''
          }${
            eventsLogs.length
              ? `

[performed actions]
${eventsLogs.length > 10 ? '**last 10 actions**\n' : ''}- ${eventsLogs.slice(Math.max(0, eventsLogs.length - 10), eventsLogs.length).join('\n- ')}`
              : ''
          }${
            needFix.length
              ? `\n\n[action error]\n**consider redo**\n${needFix.splice(0, needFix.length).join('\n')}`
              : ''
          }`,
          {
            requireScreenshot,
            complexity,
            extraAttachments: attachments,
          },
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
                for (const a of res.value.a) {
                  if ((a as WireActionWithWait).intent) {
                    yield* this.addAction({
                      ...(a as WireActionWithWait),
                      promptId,
                      id: run.allocActionId(),
                    });
                  }
                }
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
                if (res.value.next) {
                  res.value.next.tip =
                    subTaskToMerge?.promptQueue[0].goalPrompt.replace(
                      NoNestSubtaskPrompt,
                      `${res.value.next.tip}\n${NoNestSubtaskPrompt}`,
                    );
                } else {
                  res.value.next = {
                    tip: subTaskToMerge?.promptQueue[0].goalPrompt,
                  };
                }
                console.log('merge single subtask to todo', res.value.next.tip);
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
            if (url !== newTabUrl) {
              if (parent) {
                // end subtask when url change to avoid long tail subtask

                this.response = `url changed, end subtask, remain todo: ${res.value?.next?.tip ?? ''}`;
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

            if (res.value?.next) {
              yield* this.waitPageReady(url, start);
              if (res.value.next.descAttachment) {
                res.value.next.descAttachment.forEach((f) => {
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
              requireScreenshot = res.value.next.sc ?? false;
              tip = `**tip from last executor maybe outdated as page state changed, stick to the [goal] and current [HTML] page status and [performed actions] for what have been completed**
${res.value.next.tip}
`;
              toAttach = res.value.next.readFiles ?? [];
              if (this.attachmentInNextTodo.length) {
                toAttach.push(...this.attachmentInNextTodo);
                this.attachmentInNextTodo = [];
              }
            }
            if (
              todos.filter((td) => td.status === ExeSessTodoStatus.Todo)
                .length === 0
            ) {
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
            const act = res.value as WireActionWithWait;
            console.log(
              Date.now() - start,
              'exec actions:',
              act.intent,
              act.action.k,
            );
            if (act.action.k === 'todo') {
              this.handleTodo(act.action);
            } else {
              yield* this.addAction({
                ...act,
                promptId,
                id: run.allocActionId(),
              });
              run.execActions();
            }
            yield res.value as WireActionWithWait;
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
            `Fix return error: ${e instanceof Error ? e.message : ''} ${JSON.stringify(e)}
[original mission]
${runSubPrompt}`,
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
  async *addAction(action: WireActionWithWaitAndRec) {
    const subtask = await SmartAction.buildSubtask(action, this);
    console.log('addAction', action.intent, action.action.k);
    if (subtask) {
      yield* subtask.exec();
      this.addLog(`${action.intent}:${subtask.response ?? ''}`);
    } else {
      this.actions.push(action);
      this.run.addAction(action);
    }
  }
  removePendingActions() {
    this.actions = this.actions.filter((a) => !!a.done);
    this.run.removePendingActions();
  }
  addLog(log: string) {
    this.eventsLogs.push(log);
  }

  private handleTodo(action: Extract<WireAction, { k: 'todo' }>) {
    const { todos } = this;
    switch (action.a) {
      case 'add':
        if (action.add && action.add.length) {
          todos.splice(
            action.pos ?? 0,
            0,
            ...action.add.map((todo) => ({
              todo,
              status: ExeSessTodoStatus.Todo,
            })),
          );
        }
        break;
      case 'cancel':
        if (
          action.pos !== undefined &&
          action.pos !== null &&
          todos[action.pos]
        ) {
          todos[action.pos].status = ExeSessTodoStatus.Cancel;
        }
        break;
      case 'done':
        if (
          action.pos !== undefined &&
          action.pos !== null &&
          todos[action.pos]
        ) {
          todos[action.pos].status = ExeSessTodoStatus.Done;
        }
        break;
    }
  }
}
