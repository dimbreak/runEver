import { TabWebView } from '../main/webView/tab';
import { Util } from '../webView/util';
import { estimatePromptComplexity } from '../utils/llm';
import { LlmApi } from './api';
import {
  ExecutionMaxRetry,
  PlanAfterNavigation,
  PlanAfterRerender,
} from './constants';
import { ExecutionPrompter } from './execution';
import { RiskOrComplexityLevel } from './execution.schema';
import { Prompt, WireActionWithWaitAndRec } from './types';
import { type WebViewLlmSession } from './webviewLlmSession';
import { ExecutionSession } from './session';
import { replaceJsTpl } from '../webView/selector';

export class PromptRun {
  executionSession: ExecutionPrompter;
  args: Record<string, any> = {};
  llmAttachments: LlmApi.Attachment[] = [];
  actions: WireActionWithWaitAndRec[] = [];
  currentAction = 0;
  actionId = 0;
  browserActionLock = Util.newLock('browserActionLock');
  browserActionLockOk = false;
  prompts: Prompt[] = [];
  rootSession: ExecutionSession;
  sessionQueue: ExecutionSession[] = [];
  runningSession: ExecutionSession[] = [];

  stopRequested = false;
  constructor(
    private manager: WebViewLlmSession,
    private thisTab: TabWebView,
    public requestId: number,
  ) {
    this.executionSession = new ExecutionPrompter(manager);
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
      if (!this.stopRequested) {
        const keys = Object.keys(this.args ?? {});
        if (keys.length) {
          yield `\n\n[args]\n${JSON.stringify(this.args, null, 2)}`;
        }
      }
    }
  }

  breakPromptForExeErr = false;

  get tab(): TabWebView {
    return this.manager.getFocusedTab() ?? this.thisTab;
  }

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
      this.manager.notifySnapshotChanged();
      return;
    }
    this.actions.push(action);
    this.manager.notifySnapshotChanged();
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
    this.sessionQueue[
      this.prompts[currentAction.promptId!].sessionId ?? -1
    ]?.addLog(currentAction.intent);
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
    if (this.stopRequested) return;
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
      const { goalPrompt } = selectedPrompt;
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

  removePendingActions() {
    this.actions = this.actions.filter((a) => !!a.done);
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
