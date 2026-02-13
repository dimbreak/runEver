import { Writeable } from 'zod/v3';
import { $strip } from 'zod/v4/core';
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
import { CommonUtil } from '../utils/common';
import { RunEverConfig, RuneverConfigStore } from '../main/runeverConfigStore';

export class PromptRun {
  tabNotes: Record<number, string> = {};
  args: Record<string, any> = {};
  actions: WireActionWithWaitAndRec[] = [];
  currentAction = 0;
  browserActionLock = Util.newLock('browserActionLock');
  browserActionLockOk = false;
  prompts: Prompt[] = [];
  rootSession: ExecutionSession;
  sessionQueue: ExecutionSession[] = [];
  runningSession: ExecutionSession[] = [];
  globalArgs: RunEverConfig['arguments'] = [];
  secretArgs: Record<string, string> = {};

  stopRequested = false;
  constructor(
    public manager: WebViewLlmSession,
    private thisTab: TabWebView,
    public requestId: number,
  ) {
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
  getSecretArg(key: string): string | undefined {
    return this.secretArgs[key];
  }
  getGlobalArgs(domain: string): Record<string, string> {
    return this.globalArgs
      .filter((a) => !a.domain || domain.includes(a.domain))
      .reduce(
        (acc, a) => {
          acc[a.name] = a.isSecret ? '**SECRET**' : a.value;
          return acc;
        },
        {} as Record<string, string>,
      );
  }
  setGlobalArgs(args: RunEverConfig['arguments']) {
    this.globalArgs = this.globalArgs.splice(
      0,
      this.globalArgs.length,
      ...args,
    );
  }
  getArgs(domain: string) {
    return { ...this.getGlobalArgs(domain), ...this.args };
  }
  async *initPrompt(
    promptTxt: string,
    args?: Record<string, string>,
    reasoningEffort?: LlmApi.ReasoningEffort,
    modelType?: LlmApi.LlmModelType,
    attachment?: string[],
  ): AsyncGenerator<string, void, void> {
    this.stopRequested = false;

    // todo check stage prompt to correct session
    const { rootSession } = this;
    if (true) {
      const prompt: Prompt = this.createPrompt(
        promptTxt,
        args,
        0,
        'l',
        undefined,
        attachment,
      );
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

  tabNote(noteBeforeLeave: string) {
    this.tabNotes[this.tab.frameIds.values().next().value!] = noteBeforeLeave;
  }

  stop() {
    this.stopRequested = true;
    this.fixingAction.splice(0, this.fixingAction.length);
    this.browserActionLock.unlock();
  }

  allocActionId() {
    return this.manager.allocActionId(this.requestId);
  }

  getNextAction(): WireActionWithWaitAndRec | undefined {
    console.log('pending actions', this.actions.slice(this.currentAction - 1));
    return this.actions[this.currentAction];
  }

  async execActions() {
    if (!this.fixingAction.length) {
      if (this.actions.length > this.currentAction) {
        this.browserActionLockOk = false;
        // this.manager.ensureRunLocked(this.requestId);
        this.manager.enqueueRun(this.requestId);
      } else {
        console.log('execActions no action');
      }
    } else {
      console.log('fixing action skip exec');
    }
  }

  getRemainActions(): WireActionWithWaitAndRec[] {
    const actions = this.actions.slice(this.currentAction);
    return actions;
  }

  addAction(action: WireActionWithWaitAndRec) {
    this.actions.push(action);
    this.manager.notifySnapshotChanged();
  }

  actionDone(
    completedId: number,
    argsDelta: Record<string, string> | undefined,
  ) {
    if (this.actions.length === 0) return;
    const currentAction = this.actions[this.currentAction];
    if (!currentAction || currentAction.id !== completedId) {
      console.warn(
        'Popping actions out of order:',
        completedId,
        this.actions[this.currentAction]?.id,
      );
      return;
    }
    this.currentAction++;
    currentAction.done = true;
    const sess =
      this.sessionQueue[this.prompts[currentAction.promptId!].sessionId ?? -1];
    if (argsDelta) {
      const waitMsgs: Record<string, string> = {};
      this.args = {
        ...this.args,
        ...Object.entries(argsDelta)
          .filter(([k, v]) => {
            if (k.startsWith('waitMsg')) {
              waitMsgs[k] = v;
              return false;
            }
            return true;
          })
          .reduce(
            (acc, kv) => {
              acc[kv[0]] = kv[1];
              return acc;
            },
            {} as Record<string, string>,
          ),
      };
      currentAction.argsDelta = argsDelta;
      if (Object.keys(waitMsgs).length) {
        sess?.waitMsgComplete(
          waitMsgs.waitMsgId,
          waitMsgs.waitMsgResult,
          waitMsgs.waitMsg1stId,
          waitMsgs.waitMsgLastId,
        );
      }
    }
    sess?.addLog(`${currentAction.intent}-Done`);
    console.log(
      'Popped actions:',
      this.actions.length,
      this.currentAction,
      completedId,
    );
    if (this.stopRequested) {
      console.log('Stopped stopRequested');
      return;
    }
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
    const sess =
      this.sessionQueue[this.prompts[currentAction.promptId!].sessionId ?? -1];
    sess?.addLog(`${currentAction.intent}-Error:${error}`);
    sess?.needFix.push(JSON.stringify(currentAction));
    this.currentAction++;
    if (this.stopRequested) {
      console.log('Stopped stopRequested');
      return;
    }
    console.log(
      'continue after error',
      this.currentAction,
      this.actions.length,
    );
    if (this.currentAction < this.actions.length) {
      this.execActions();
    } else {
      this.browserActionLock.delayUnlock(500);
    }
    // this.fixAction();
  }

  fixingAction: {
    action: WireActionWithWaitAndRec;
    offset: number;
    promptId: number;
    sessionId: number;
  }[] = [];
  async fixAction() {
    const actionToFix = this.actions[this.currentAction];
    if (actionToFix.error && actionToFix.error.length >= ExecutionMaxRetry) {
      console.log('Too many error, skip fixing');
      this.breakPromptForExeErr = true;
      return;
    }
    const selectedPrompt = this.prompts[actionToFix.promptId!];
    console.log('Try fix error:', actionToFix, selectedPrompt);

    const sessionId = selectedPrompt?.sessionId;

    if (sessionId !== undefined) {
      const session = this.sessionQueue[sessionId];
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
- if it can be fix, return a single replacement action only
- return multiple actions will clear the waiting queue, consider you are re-running the mission/goal

[action error]
${JSON.stringify(actionToFix)}`,
      );
      this.fixingAction.push({
        action: actionToFix,
        offset: 0,
        promptId: prompt.id,
        sessionId,
      });
      session.promptQueue.splice(
        this.fixingAction.filter((fa) => fa.sessionId === sessionId).length - 1,
        0,
        prompt,
      );

      this.browserActionLock.unlock();
    } else {
      console.log('no session id');
    }
  }

  createSession(
    queue: Prompt[],
    parent: ExecutionSession | undefined = undefined,
  ) {
    const session = new ExecutionSession(0, queue, this, parent);
    return this.wrapSession(session);
  }

  wrapSession<S extends ExecutionSession>(session: S): S {
    const sessionId = this.sessionQueue.push(session) - 1;
    session.id = sessionId;
    session.promptQueue.forEach((p) => {
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
    attachments: string[] | undefined = undefined,
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
      attachments,
    };
    prompt.id = this.prompts.push(prompt) - 1;
    if (argsAdded) {
      this.args = {
        ...this.args,
        ...Object.entries(argsAdded).reduce(
          (acc, [k, v]) => {
            const vv = CommonUtil.replaceJsTpl(v, this.args);
            if (vv) {
              acc[k] = vv;
            }
            return acc;
          },
          {} as Record<string, string>,
        ),
      };
    }

    return prompt;
  }

  removePendingActions() {
    this.actions = this.actions.slice(0, this.currentAction);
  }

  setRunningStatus(session: ExecutionSession) {
    this.runningSession.unshift(session);
    this.manager.notifySnapshotChanged();
    return () => {
      this.runningSession = this.runningSession.filter((s) => s !== session);
      this.manager.notifySnapshotChanged();
    };
  }
}
