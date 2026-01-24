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

// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');

export class ExecutionSession {
  subSessionQueue: ExecutionSession[];
  actions: WireActionWithWaitAndRec[] = [];
  breakPromptForExeErr = false;
  eventsLogs: string[] = [];
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
    if (this.promptQueue.length === 0) {
      yield* this.execSubSessionQueue();
      return;
    }
    console.log(
      'Prompt start:',
      this.promptQueue[0]?.goalPrompt ?? 'no prompt',
    );
    let requireScreenshot = false;
    const { run, promptQueue, id, actions, subSessionQueue, eventsLogs } = this;
    const { tab, executionSession, args, browserActionLock } = run;
    let { url } = tab;
    let stepsStream: AsyncGenerator<
      WireActionWithWait | WireSubTask,
      ExecutorLlmResult | undefined,
      void
    >;
    const finish = run.setRunningStatus(this);
    if (promptQueue.length === 0) {
      const res = yield* this.execSubSessionQueue();
      finish();
      return res;
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
- ${eventsLogs.join('\n- ')}`,
              )
            : runSubPrompt,
          requireScreenshot,
          complexity,
          run.llmAttachments,
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
            if (res.value && run.fixingAction?.promptId === promptId) {
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
                    id: run.actionId++,
                  });
                }
              });
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

            if (this.subSessionQueue.length) {
              console.log('Run sub session queue');
              yield* this.waitPageReady(url, start);
              yield* this.execSubSessionQueue();
            }
            if (run.stopRequested) {
              finish();
              return;
            }

            if (res.value?.todo) {
              yield* this.waitPageReady(url, start);
              executionSession.resetSystemPrompt();
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
              if (
                run.fixingAction === null ||
                run.fixingAction?.promptId !== promptId
              ) {
                console.log(Date.now() - start, 'exec actions:', res.value);
                this.addAction({
                  ...(res.value as WireActionWithWait),
                  promptId,
                  id: run.allocActionId(),
                });
                run.execActions();
                yield res.value as WireActionWithWait;
              }
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
    const { subSessionQueue } = this;
    while (subSessionQueue.length) {
      const subSession = subSessionQueue.shift()!;
      yield* subSession.exec();
      this.addLog(subSession.promptQueue[0]?.goalPrompt ?? '');
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
              id: this.run.actionId++,
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
