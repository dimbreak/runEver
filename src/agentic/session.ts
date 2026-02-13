import { estimatePromptComplexity } from '../utils/llm';
import { Network } from '../webView/network';
import { Util } from '../webView/util';
import { PlanAfterNavigation, PlanAfterRerender } from './constants';
import {
  ExecutorLlmResult,
  RiskOrComplexityLevel,
  WireAction,
  WireActionWithWait,
  WireSubTask,
} from './execution.schema';
import { PromptRun } from './promptRun';
import { Prompt, WireActionWithWaitAndRec } from './types';
import { LlmApi } from './api';
import { SmartAction } from './profile/smartAction';
import { ExecutionPrompter } from './execution';

// LlmApi.addDummyReturn([
//   'prompt-record/log-20260208222244459.json',
//   'prompt-record/log-20260208222256920.json',
//   'prompt-record/log-20260208222312702.json',
//   'prompt-record/log-20260208222329924.json',
//   'prompt-record/log-20260208222346318.json',
//   'prompt-record/log-20260208222404411.json',
//   'prompt-record/log-20260208222502144.json',
//   'prompt-record/log-20260208222514145.json',
//   'prompt-record/log-20260208222530941.json',
// ]);

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
// LlmApi.addDummyReturn('null');

export enum ExeSessStatus {
  Todo = 0,
  Working = 1,
  Verified = 2,
  Cancel = 3,
  Abnormal = 4,
}

interface ExeSessCheckPoint {
  checkPoint: string;
  status: ExeSessStatus;
  comment?: string;
}

const NoNestSubtaskPrompt =
  '**running a subtask, do not add subtask, if the task on the current UI should split, end this subtask with finishedNoToDo and shortly < 10words advise in subtaskResp**';
export class ExecutionSession {
  forceComplexity: RiskOrComplexityLevel | undefined;
  prompter: ExecutionPrompter;
  subSessionQueue: ExecutionSession[];
  actions: WireActionWithWaitAndRec[] = [];
  breakPromptForExeErr = false;
  eventsLogs: string[] = [];
  needFix: string[] = [];
  checklist: ExeSessCheckPoint[] = [];
  attachmentInNextPrompt: string[] = [];
  response: string | undefined = undefined;
  onCompleted: undefined | ((session: ExecutionSession) => void);
  updateGoal: (() => string) | undefined;
  status: ExeSessStatus | string = ExeSessStatus.Todo;
  notices: string[] = [];
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
    const {
      run,
      id,
      eventsLogs,
      parent,
      prompter,
      needFix,
      checklist,
      actions,
      notices,
      forceComplexity,
      updateGoal,
    } = this;
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
    const { tab, browserActionLock, manager, getGlobalArgs } = run;
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
    this.status = ExeSessStatus.Working;
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
          updateGoal ? updateGoal() : runGoalPrompt,
          run.getArgs(url.split('/').slice(0, 3).join('/')),
          `${notices.length ? `\n\n${notices.splice(0, notices.length).join('\n\n')}\n\n` : ''}[checklist ${checklist.filter((td) => td.status !== ExeSessStatus.Todo && td.status !== ExeSessStatus.Working).length}/${checklist.length}]
${
  checklist.length
    ? `${checklist.map((cp, i) => formatChecklist(cp, i)).join(',\n')}\n**checklist is from executor may not be 100% correct, stick to guide and rules**\n**WORK IN ORDER one by one, skipping/shuffle absolutely not allowed, repeat ORDER IS IMPORTANT**`
    : `**you are first executor**, you must use [checklist.add] action to add check points unless you can finish it in few actions${
        parent
          ? ''
          : `
**breakdown conjunctions like and/then to multiple points, lines**, do A (and/then) B means adding ['A', 'B'], long/mixed check point is hard to trace, harmful.
**follow [checklist rules], CAREFULLY DOUBLE CHECK if you add everything in proper way**`
      }`
}${
            tip
              ? `

[tip from last executor]
${tip}
`
              : ''
          }${
            eventsLogs.length
              ? `

[performed actions]
${eventsLogs.length > 10 ? '**last 10 actions**\n' : ''}- ${eventsLogs.slice(Math.max(0, eventsLogs.length - 10), eventsLogs.length).join('\n- ')}
**identify job status, move forward to goal**`
              : ''
          }${
            needFix.length
              ? `\n\n[action error]\n**consider redo**\n${needFix.splice(0, needFix.length).join('\n')}`
              : ''
          }`,
          {
            requireScreenshot,
            complexity: forceComplexity ?? complexity,
            extraAttachments: toAttach.length
              ? toAttach
                  .splice(0, toAttach.length)
                  .concat(...(attachments ?? []))
              : attachments,
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
          const newTabUrl = manager.getFocusedTab()?.url ?? tab.url;
          console.log(
            Date.now() - start,
            'Waiting for complete prompt',
            !!res.value,
            !res.done,
          );
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
            if (url !== newTabUrl) {
              if (parent) {
                // end subtask when url change to avoid long tail subtask

                this.response = `url changed, end subtask, remain next: ${res.value?.next?.tip ?? ''}`;
                this.status = this.response;
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

            if (res.value?.endSess) {
              this.status = res.value?.endSess;
              // eslint-disable-next-line no-labels
              break promptQueueLoop;
            } else if (res.value?.next) {
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
              if (this.breakPromptForExeErr) {
                console.log(
                  Date.now() - start,
                  'break prompting for exe err todo',
                );
                this.breakPromptForExeErr = false;
                break;
              }
              requireScreenshot = res.value.next.sc ?? false;
              tip = `**tip from last executor maybe outdated as page state changed, stick to the [GOAL] and current [HTML] page status and [performed actions] for what have been completed**
${res.value.next.tip}
`;
              toAttach = res.value.next.readFiles ?? [];
              if (this.attachmentInNextPrompt.length) {
                toAttach.push(...this.attachmentInNextPrompt);
                this.attachmentInNextPrompt = [];
              }
            }
            console.log(
              'checklist todo',
              checklist.filter(
                (td) =>
                  td.status === ExeSessStatus.Todo ||
                  td.status === ExeSessStatus.Working,
              ).length,
            );
            url = newTabUrl;
            if (
              checklist.filter(
                (td) =>
                  td.status === ExeSessStatus.Todo ||
                  td.status === ExeSessStatus.Working,
              ).length === 0
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
            if (url === newTabUrl) {
              if (act.action.k === 'checklist') {
                this.handleChecklist(act.action, needFix.length > 0);
              } else {
                const actionsLen = actions.length;
                yield* this.addAction({
                  ...act,
                  promptId,
                  id: run.allocActionId(),
                });
                if (
                  actions.length > actionsLen &&
                  run.browserActionLock.tryLock()
                ) {
                  run.execActions();
                }
              }
            } else {
              console.log(
                'action skipped url changed',
                act.intent,
                act.action.k,
                url,
                newTabUrl,
              );
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
    if (this.status === ExeSessStatus.Working) {
      if (
        checklist.some(
          (td) =>
            td.status === ExeSessStatus.Todo ||
            td.status === ExeSessStatus.Working,
        )
      ) {
        this.status = ExeSessStatus.Cancel;
      } else {
        this.status = checklist.some(
          (td) => td.status === ExeSessStatus.Verified,
        )
          ? ExeSessStatus.Verified
          : ExeSessStatus.Cancel;
      }
    }
    if (this.onCompleted) {
      this.onCompleted(this);
    }
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
    const makeWorking = (): boolean => {
      if (action.cp && action.cp.length) {
        for (const p of action.cp) {
          const cp = this.checklist[p];
          if (cp) {
            if (cp.status === ExeSessStatus.Verified) {
              if (!action.unverify) {
                this.needFix.push(
                  `cannot work on verified check point #${p} without unverify option, make sure you have strong reason`,
                );
                return false;
              }
            }
            if (
              cp.status === ExeSessStatus.Todo ||
              cp.status === ExeSessStatus.Abnormal
            ) {
              cp.status = ExeSessStatus.Working;
              if (cp.comment) {
                cp.comment = undefined;
              }
            }
          }
        }
      }
      return true;
    };
    console.log('addAction', action.intent, action.action.k);
    if (subtask) {
      if (!makeWorking()) return;
      yield* subtask.exec();
      this.addLog(`${action.intent}:${subtask.response ?? ''}`);
    } else if (action.action.k === 'addNewTask') {
      this.handleChecklist(
        {
          k: 'checklist',
          a: 'add',
          pos: action.action.afterCpId,
          add: action.action.checkPoints,
        },
        false,
        true,
      );
    } else {
      if (!makeWorking()) return;
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

  private handleChecklist(
    action: Extract<WireAction, { k: 'checklist' }>,
    hasError: boolean,
    fromAddNewTask = false,
  ) {
    const { checklist } = this;
    switch (action.a) {
      case 'add':
        if (action.add && action.add.length) {
          if (checklist.length === 0 || fromAddNewTask) {
            checklist.splice(
              action.pos === undefined || action.pos === null
                ? 0
                : action.pos + 1,
              0,
              ...action.add.map((checkPoint) => ({
                checkPoint,
                status: ExeSessStatus.Todo,
              })),
            );
          } else {
            this.needFix.push(
              `checklist add can only use add initial check point, use addNewTask after.`,
            );
          }
        }
        return;
      case 'working':
        if (
          action.pos !== undefined &&
          action.pos !== null &&
          checklist[action.pos]
        ) {
          if (
            action.rework &&
            checklist[action.pos].status === ExeSessStatus.Verified
          ) {
            this.needFix.push(
              `cannot work on verified check point #${action.pos} without rework option, make sure you have strong reason`,
            );
          }
          checklist[action.pos].status = ExeSessStatus.Working;
        }
        break;
      case 'cancel':
        if (
          action.pos !== undefined &&
          action.pos !== null &&
          checklist[action.pos]
        ) {
          checklist[action.pos].status = ExeSessStatus.Cancel;
        }
        break;
      case 'verified':
        if (
          !hasError &&
          action.pos !== undefined &&
          action.pos !== null &&
          checklist[action.pos]
        ) {
          if (checklist[action.pos].status === ExeSessStatus.Working) {
            checklist[action.pos].status = ExeSessStatus.Verified;
          } else {
            this.needFix.push(
              `Cannot mark checkpoint#${action.pos} as done as it's not working status${checklist[action.pos].status === ExeSessStatus.Todo ? ', mark working first' : ''}`,
            );
          }
        }
        break;
    }
    this.addLog(
      `set check point #${action.pos} to ${typeof action.a === 'string' ? action.a : ExeSessStatus[action.a as ExeSessStatus]} - no actual action`,
    );
  }
  waitMsgComplete(
    waitMsgId: string | undefined,
    waitMsgResult: string | undefined,
    waitMsg1stId?: string,
    waitMsgLastId?: string,
  ) {
    if (!waitMsgResult || waitMsgResult === 'timeout') {
      this.notices.push(`[Wait ${waitMsgId} timeout]
**no new message**`);
    } else {
      this.notices.push(`[GOT NEW MESSAGE FROM ${waitMsgId}]
new messages since last wait, **MUST CHECK HTML ID: ${waitMsgResult}**, if you found new task & [GOAL] permits, **MUST USE addNewTask**`);
    }
  }
}

const formatChecklist = (cp: ExeSessCheckPoint, i: number): string => {
  let status = ExeSessStatus[cp.status];
  if (cp.status === ExeSessStatus.Working) {
    status = `**${status}**`;
  }
  if (cp.status === ExeSessStatus.Abnormal) {
    status = `**${status}**`;
  }
  return `${i}:${status}:${cp.checkPoint}${cp.comment ? `read comment: ${cp.comment}` : ''}`;
};
