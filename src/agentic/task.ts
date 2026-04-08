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
import { Session } from './session';
import { Prompt, WireActionWithWaitAndRec } from './types';
import { SmartAction } from './addOns/smartAction';
import { ExecutionPrompter } from './execution';
import {
  TaskSnapshot,
  TaskRunningStatus,
  ExeTaskStatus,
  ExeTaskCheckPoint,
  WireActionStatus,
} from '../schema/taskSnapshot';
import { AddOns } from './addOns/addons';
import { WebSkill } from './addOns/skills/webSkill/webSkill.action';
import { LlmApi } from './api';

export { ExeTaskStatus } from '../schema/taskSnapshot';

// LlmApi.addDummyReturn([
//   'prompt-record/log-20260407202053825.json',
//   'prompt-record/log-20260407202110142.json',
//   'prompt-record/log-20260407202126171.json',
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

const NoNestSubtaskPrompt =
  '**running a subtask, do not add subtask, if the task on the current UI should split, end this subtask with finishedNoToDo and shortly < 10words advise in subtaskResp**';
export class ExecutionTask {
  forceComplexity: RiskOrComplexityLevel | undefined;
  prompter: ExecutionPrompter;
  subTaskQueue: ExecutionTask[];
  allSubTasks: ExecutionTask[] = [];
  actions: WireActionWithWaitAndRec[] = [];
  breakPromptForExeErr = false;
  eventsLogs: string[] = [];
  needFix: string[] = [];
  checklist: ExeTaskCheckPoint[] = [];
  attachmentInNextPrompt: string[] = [];
  response: string | undefined = undefined;
  onBeforeChecked: undefined | ((session: ExecutionTask) => Promise<void>);
  onCompleted: undefined | ((session: ExecutionTask) => void);
  updateGoal: (() => string) | undefined;
  status: ExeTaskStatus | string = ExeTaskStatus.Todo;
  runningStatus: TaskRunningStatus = 'Pending';
  notices: string[] = [];
  parentCheckPointId?: number;
  constructor(
    public intent: string,
    public id: number,
    public promptQueue: Prompt[],
    public session: Session,
    public parent?: ExecutionTask,
  ) {
    this.prompter = new ExecutionPrompter(session);
    this.subTaskQueue = [];
  }
  updateRunningStatus(status: TaskRunningStatus) {
    this.runningStatus = status;
    this.session.pushSnapshot();
  }
  async *exec(): AsyncGenerator<
    string | symbol | WireActionWithWait,
    void,
    void
  > {
    const {
      session,
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
    if (session.fixingAction.length === 0 && this.promptQueue.length === 0) {
      yield* this.execSubSessionQueue();
      return;
    }
    console.log(
      'Prompt start:',
      this.promptQueue[0]?.goalPrompt ?? 'no prompt',
    );
    let retry = 3;
    let requireScreenshot = false;
    const { tab, browserActionLock } = session;
    let { url } = tab;
    let stepsStream: AsyncGenerator<
      WireActionWithWait | WireSubTask,
      ExecutorLlmResult | undefined,
      void
    >;
    const finish = session.setRunningStatus(this);
    if (session.fixingAction.length === 0 && promptQueue.length === 0) {
      const res = yield* this.execSubSessionQueue();
      finish();
      return res;
    }
    let tip = '';
    let toAttach: string[] = this.attachmentInNextPrompt ?? [];
    const promptItem = promptQueue.shift()!;
    this.status = ExeTaskStatus.Working;
    await AddOns.postTurnDone();
    // eslint-disable-next-line no-labels
    promptQueueLoop: while (true) {
      if (session.stopRequested) {
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
        this.updateRunningStatus('Thinking');
        stepsStream = prompter.execPrompt(
          updateGoal ? updateGoal() : runGoalPrompt,
          session.getArgs(new URL(url).hostname),
          `${notices.length ? `\n\n${notices.splice(0, notices.length).join('\n\n')}\n\n` : ''}[checklist ${checklist.filter((td) => td.status !== ExeTaskStatus.Todo && td.status !== ExeTaskStatus.Working).length}/${checklist.length}]
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
          if (session.stopRequested) {
            finish();
            return;
          }
          const newTabUrl = session.getFocusedTab()?.url ?? tab.url;
          console.log(
            Date.now() - start,
            'Waiting for complete prompt',
            !!res.value,
            !res.done,
          );
          if (res.done) {
            await AddOns.postTurnDone();
            if (
              res.value &&
              session.fixingAction.length &&
              session.fixingAction[0]?.promptId === promptId
            ) {
              if (
                res.value.a.length === 1 &&
                (res.value.a[0] as WireActionWithWait).intent
              ) {
                const fixingAct = session.fixingAction[0].action;
                fixingAct.intent = (
                  res.value.a[0] as WireActionWithWait
                ).intent;
                fixingAct.action = (
                  res.value.a[0] as WireActionWithWait
                ).action;
                fixingAct.risk = (res.value.a[0] as WireActionWithWait).risk;
                fixingAct.pre = (res.value.a[0] as WireActionWithWait).pre;
                fixingAct.post = (res.value.a[0] as WireActionWithWait).post;
                session.fixingAction.shift();
                console.log('Fixing action done replace');
              } else {
                // remove pending if todo exist
                this.removePendingActions();
                this.promptQueue = [];
                promptQueue = [];
                session.fixingAction.splice(0, session.fixingAction.length);
                for (const a of res.value.a) {
                  if ((a as WireActionWithWait).intent) {
                    yield* this.addAction({
                      ...(a as WireActionWithWait),
                      promptId,
                      id: session.allocActionId(),
                      status: WireActionStatus.pending,
                    });
                  }
                }
                console.log('Fixing action done clear');
              }
              session.execActions();
            }
            console.log(Date.now() - start, 'Waiting for complete prompt');
            // todo fix error sometimes block here
            await browserActionLock.wait;
            if (session.stopRequested) {
              console.log('Stop requested');
              finish();
              return;
            }

            if (session.fixingAction.length === 0 && this.subTaskQueue.length) {
              if (this.subTaskQueue.length === 1 && res.value) {
                // prevent llm adding single subtask
                const subTaskToMerge = this.subTaskQueue.shift()!;
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

            if (session.stopRequested) {
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
                  const ff = session.readableFiles.get(f.name);
                  if (ff) {
                    ff.desc = f.desc;
                  }
                });
              }
              if (session.stopRequested) {
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
              checklist.length,
              checklist.filter(
                (td) =>
                  td.status === ExeTaskStatus.Todo ||
                  td.status === ExeTaskStatus.Working,
              ).length,
            );
            url = newTabUrl;
            if (
              checklist.filter(
                (td) =>
                  td.status === ExeTaskStatus.Todo ||
                  td.status === ExeTaskStatus.Working,
              ).length === 0
            ) {
              if (this.onBeforeChecked) {
                await this.onBeforeChecked(this);
                if (
                  checklist.filter(
                    (td) =>
                      td.status === ExeTaskStatus.Todo ||
                      td.status === ExeTaskStatus.Working,
                  ).length !== 0
                ) {
                  continue;
                }
              }
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
                this.updateRunningStatus('Executing');
                const actionsLen = actions.length;
                yield* this.addAction({
                  ...act,
                  promptId,
                  id: session.allocActionId(),
                  status: WireActionStatus.pending,
                });
                if (
                  actions.length > actionsLen &&
                  session.browserActionLock.tryLock()
                ) {
                  session.execActions();
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
          session.createPrompt(
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
    this.updateRunningStatus('Finished');
    finish();
    if (this.status === ExeTaskStatus.Working) {
      if (
        checklist.some(
          (td) =>
            td.status === ExeTaskStatus.Todo ||
            td.status === ExeTaskStatus.Working,
        )
      ) {
        this.status = ExeTaskStatus.Cancel;
      } else {
        this.status = checklist.some(
          (td) => td.status === ExeTaskStatus.Verified,
        )
          ? ExeTaskStatus.Verified
          : ExeTaskStatus.Cancel;
      }
    }
    if (this.onCompleted) {
      this.onCompleted(this);
    }
  }
  async *waitPageReady(url: string, start = Date.now()) {
    const { tab } = this.session;
    if (tab.url === url) {
      console.log('Waiting for potential page load');
      await Util.sleep(2000);
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
      console.log(Date.now() - start, 'Waiting for page to load:', url);
      await tab.pageLoadedLock.wait;
    }
  }
  async *execSubSessionQueue() {
    const {
      subTaskQueue,
      session: { tab },
    } = this;
    const manager = this.session;
    const { url } = tab;
    while (subTaskQueue.length) {
      const subSession = subTaskQueue.shift()!;
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
    const st = this.session.createSession(queue, this);
    this.subTaskQueue.push(st);
    this.allSubTasks.push(st);
  }
  async *addAction(action: WireActionWithWaitAndRec) {
    const subtask = await SmartAction.buildSubtask(action, this);
    const markWorking = (): boolean => {
      let useSkillNames =
        action.action?.k === 'activateInstalledSkills' ? action.action.s : null;
      if (useSkillNames) {
        AddOns.activateSkills(useSkillNames);
      } else if (action.action.k === 'activateWebSkill') {
        WebSkill.activateSkill(action.action.mdUrl);
        useSkillNames = [];
      }
      if (action.cp && action.cp.length) {
        for (const p of action.cp) {
          const cp = this.checklist[p];
          if (cp) {
            if (useSkillNames) {
              cp.skills = cp.skills
                ? useSkillNames.concat(cp.skills)
                : useSkillNames;
            }
            if (cp.status === ExeTaskStatus.Verified) {
              if (!action.unverify) {
                this.needFix.push(
                  `cannot work on verified check point #${p} without unverify option, make sure you have strong reason`,
                );
                return false;
              }
            }
            if (
              cp.status === ExeTaskStatus.Todo ||
              cp.status === ExeTaskStatus.Abnormal
            ) {
              cp.status = ExeTaskStatus.Working;
              if (cp.comment) {
                cp.comment = undefined;
              }
            }
          }
        }
      }
      return !useSkillNames;
    };
    console.log('addAction', action.intent, action.action.k);
    if (subtask) {
      if (!markWorking()) return;
      this.allSubTasks.push(subtask);
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
      if (!markWorking()) return;
      this.actions.push(action);
      this.session.addAction(action);
    }
    this.session.pushSnapshot();
  }
  removePendingActions() {
    this.actions = this.actions.map((a) =>
      a.status === WireActionStatus.pending
        ? { ...a, status: WireActionStatus.skipped }
        : a,
    );
    this.session.removePendingActions();
  }
  addLog(log: string) {
    this.eventsLogs.push(log);
  }

  handleChecklist(
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
                ? checklist.length
                : action.pos + 1,
              0,
              ...action.add.map((checkPoint) => ({
                checkPoint,
                status: ExeTaskStatus.Todo,
              })),
            );
          } else {
            this.needFix.push(
              `checklist add can only use add initial check point, use addNewTask after.`,
            );
          }
        }
        this.session.pushSnapshot();
        return;
      case 'working':
        if (
          action.pos !== undefined &&
          action.pos !== null &&
          checklist[action.pos]
        ) {
          if (
            action.rework &&
            checklist[action.pos].status === ExeTaskStatus.Verified
          ) {
            this.needFix.push(
              `cannot work on verified check point #${action.pos} without rework option, make sure you have strong reason`,
            );
          }
          checklist[action.pos].status = ExeTaskStatus.Working;
        }
        break;
      case 'cancel':
        if (
          action.pos !== undefined &&
          action.pos !== null &&
          checklist[action.pos]
        ) {
          checklist[action.pos].status = ExeTaskStatus.Cancel;
          if (checklist[action.pos].skills) {
            AddOns.deactivateSkill(checklist[action.pos].skills!);
          }
        }
        break;
      case 'verified':
        if (
          !hasError &&
          action.pos !== undefined &&
          action.pos !== null &&
          checklist[action.pos]
        ) {
          if (
            checklist[action.pos].status === ExeTaskStatus.Working ||
            action.force
          ) {
            checklist[action.pos].status = ExeTaskStatus.Verified;
            if (checklist[action.pos].skills) {
              AddOns.deactivateSkill(checklist[action.pos].skills!);
            }
          } else {
            this.needFix.push(
              `Cannot mark checkpoint#${action.pos} as done as it's not working status${checklist[action.pos].status === ExeTaskStatus.Todo ? ', mark working first' : ''}`,
            );
          }
        }
        break;
    }
    this.session.pushSnapshot();
    this.addLog(
      `set check point #${action.pos} to ${typeof action.a === 'string' ? action.a : ExeTaskStatus[action.a as ExeTaskStatus]} - no actual action`,
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

  getSnapshot(): Omit<TaskSnapshot, 'actions'> {
    const subTasksByCheckPointId = this.allSubTasks.reduce(
      (acc, ss) => {
        acc[ss.parentCheckPointId ?? -1] = ss.getSnapshot();
        return acc;
      },
      {} as Record<number, Omit<TaskSnapshot, 'actions'>>,
    );
    let status = this.runningStatus;
    if (
      status === 'Executing' &&
      Object.values(subTasksByCheckPointId).find(
        (st) => st.status === 'Thinking',
      )
    ) {
      status = 'Thinking';
    }
    return {
      intent: this.intent,
      status,
      checklist: this.checklist.slice(),
      subTasksByCheckPointId,
    };
  }
}

const formatChecklist = (cp: ExeTaskCheckPoint, i: number): string => {
  let status = ExeTaskStatus[cp.status];
  if (cp.status === ExeTaskStatus.Working) {
    status = `**${status}**`;
  }
  if (cp.status === ExeTaskStatus.Abnormal) {
    status = `**${status}**`;
  }
  return `${i}:${status}:${cp.checkPoint}${cp.comment ? `read comment: ${cp.comment}` : ''}`;
};
