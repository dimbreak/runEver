import { TabWebView } from '../main/webView/tab';
import { LlmApi } from './api';
import { PromptRun } from './promptRun';
import { WireActionWithWaitAndRec } from './types';

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

  private async confirmAndDispatchHighRiskAction(
    requestId: number,
    run: PromptRun,
    nextAction: WireActionWithWaitAndRec,
  ) {
    try {
      const approved = await this.tab.confirmHighRiskAction(
        nextAction.intent ?? 'High risk action',
      );
      if (!approved) {
        this.stopPrompt(requestId);
        return;
      }
      // Keep `inFlightAction = true` until actionDone/actionError arrives.
      this.tab.pushActions([nextAction], run.args);
    } catch (err) {
      console.error('High risk approval failed:', err);
      this.stopPrompt(requestId);
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
      if (nextAction.risk === 'h') {
        this.confirmAndDispatchHighRiskAction(
          this.activeRequestId,
          run,
          nextAction,
        );
        return;
      }
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
      if (nextAction.risk === 'h') {
        this.confirmAndDispatchHighRiskAction(requestId, run, nextAction);
        return;
      }
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
