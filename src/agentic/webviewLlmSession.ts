import { app, BrowserWindow, Rectangle } from 'electron';
import fs from 'fs';
import { TabWebView } from '../main/webView/tab';
import { LlmApi } from './api';
import { PromptRun } from './promptRun';
import { WireActionWithWaitAndRec } from './types';
import { ToRendererIpc } from '../contracts/toRenderer';
import { Util } from '../webView/util';
import { PromptAttachment } from '../schema/attachments';
import { WireTabAction } from './execution.schema';
import { CommonUtil } from '../utils/common';
// import { CommonUtil } from '../utils/common';

const DEBUG_CONFIRM_ALL_ACTIONS = false;
const testPrompt: { user: string; system: string } | null = null;

export class WebViewLlmSession {
  private static readonly PADDING = 0;
  private static readonly DEFAULT_TABBAR_HEIGHT = 112;
  private static readonly DEFAULT_SIDEBAR_WIDTH = 430;

  public readableFiles: Map<string, PromptAttachment> = new Map();
  private runsByRequestId = new Map<number, PromptRun>();
  private runQueue: number[] = [];
  private activeRequestId: number | null = null;
  private inFlightAction = false;
  private actionIdToRequestId = new Map<number, number>();
  private nextActionId = 0;
  private lastStartedRequestId: number | null = null;
  private snapshotTimer: NodeJS.Timeout | null = null;
  private snapshotPending = false;
  private tabsById = new Map<number, TabWebView>();
  private focusedTab: TabWebView | null = null;
  private userInputResolvers = new Map<
    number,
    (answer: Record<string, string>) => void
  >();

  constructor(private mainWindow: BrowserWindow) {}

  registerTab(tab: TabWebView) {
    this.tabsById.set(tab.webView.webContents.id, tab);
    if (tab.bounds.width > 0 && tab.bounds.height > 0) {
      tab.focus();
      this.runsByRequestId
        .get(this.lastStartedRequestId ?? -1)
        ?.runningSession[0]?.addLog(
          `Populated tab and focused [${tab.webView.webContents.getTitle()}]`,
        );
    }
  }

  unregisterTab(frameId: number) {
    this.tabsById.delete(frameId);
  }

  getTab(frameId: number) {
    return this.tabsById.get(frameId);
  }

  getAnyTab() {
    return this.tabsById.values().next().value as TabWebView | undefined;
  }

  getTabsById() {
    return this.tabsById;
  }

  isFocused(tab: TabWebView) {
    return this.focusedTab === tab;
  }

  focusTab(tab: TabWebView) {
    if (this.focusedTab && this.focusedTab !== tab) {
      this.focusedTab.blur();
    }
    this.focusedTab = tab;
  }

  getFocusedTab() {
    return this.focusedTab;
  }

  getSafeBounds(
    opts: {
      sidebarWidth?: number;
      tabbarHeight?: number;
      viewportWidth?: number;
    } = {},
  ) {
    const sidebarWidth =
      opts.sidebarWidth ?? WebViewLlmSession.DEFAULT_SIDEBAR_WIDTH;
    const tabbarHeight =
      opts.tabbarHeight ?? WebViewLlmSession.DEFAULT_TABBAR_HEIGHT;

    const win = this.mainWindow?.getBounds();
    const devtoolsWidth = (win?.width ?? 1024) - (opts.viewportWidth ?? 0);
    const width = Math.max(
      320,
      (win?.width ?? 1024) -
        sidebarWidth -
        devtoolsWidth -
        WebViewLlmSession.PADDING * 2,
    );
    const height = Math.max(
      320,
      (win?.height ?? 728) - tabbarHeight - WebViewLlmSession.PADDING * 2,
    );
    return {
      x: WebViewLlmSession.PADDING,
      y: tabbarHeight + WebViewLlmSession.PADDING,
      width,
      height,
    };
  }

  createTab(detail: { url: string; bounds?: Rectangle }) {
    const bounds = detail.bounds ?? this.getSafeBounds();
    const wvTab = new TabWebView(detail.url, bounds, this.mainWindow, this);
    const frameId = wvTab.webView.webContents.id;
    wvTab.webView.webContents.once('destroyed', () => this.cleanupTab(frameId));
    wvTab.webView.webContents.on('render-process-gone', () =>
      this.cleanupTab(frameId),
    );
    this.mainWindow?.contentView.addChildView(wvTab.webView);
    this.registerTab(wvTab);
    return { id: frameId };
  }

  async operateTab(detail: {
    id: number;
    bounds?: Rectangle;
    url?: string;
    viewportWidth?: number;
    exeScript?: string;
    close?: boolean;
    visible?: boolean;
    sidebarWidth?: number;
    tabbarHeight?: number;
  }) {
    const frameId = detail.id;
    const wvTab = this.getTab(frameId);
    if (!wvTab) return { error: 'Tab not found' };
    let response;
    if (detail.close) {
      // Ensure any in-flight prompt/task is stopped before destroying webContents.
      wvTab.stopPrompt();
      wvTab.webView.setVisible(false);
      this.mainWindow?.contentView.removeChildView(wvTab.webView);
      this.unregisterTab(frameId);
      if (!wvTab.webView.webContents.isDestroyed()) {
        wvTab.webView.webContents.close();
      }
      response = 'closed';
    } else {
      if (detail.visible !== undefined) {
        wvTab.webView.setVisible(detail.visible);
        if (detail.visible) {
          wvTab.focus();
        }
      }
      if (detail.bounds) {
        wvTab.webView.setBounds(detail.bounds);
      } else if (!detail.url && !detail.exeScript) {
        wvTab.webView.setBounds(
          this.getSafeBounds({
            sidebarWidth:
              detail.sidebarWidth ?? WebViewLlmSession.DEFAULT_SIDEBAR_WIDTH,
            tabbarHeight:
              detail.tabbarHeight ?? WebViewLlmSession.DEFAULT_TABBAR_HEIGHT,
            viewportWidth: detail.viewportWidth,
          }),
        );
      }
      if (detail.url) {
        wvTab.webView.webContents.loadURL(detail.url);
        await Util.sleep(1000);
      }
      if (detail.exeScript) {
        response = await wvTab.webView.webContents.executeJavaScript(
          detail.exeScript,
        );
      }
    }
    return { response };
  }

  tabsCount() {
    return this.tabsById.size;
  }

  listTabs() {
    const { focusedTab } = this;
    return Array.from(this.tabsById.values()).map((tab) => ({
      id: tab.frameIds.values().next().value,
      title: tab.webView.webContents.getTitle(),
      url: tab.url.length > 100 ? `${tab.url.slice(0, 100)}...` : tab.url,
      focused: tab === focusedTab,
    }));
  }

  resolveUserInput(responseId: number, answer: Record<string, string>) {
    const resolver = this.userInputResolvers.get(responseId);
    if (!resolver) return;
    this.userInputResolvers.delete(responseId);
    resolver(answer);
  }

  async askUserInput<
    Q extends Record<
      string,
      | {
          type: 'string';
        }
      | {
          type: 'select';
          options: string[];
        }
    >,
  >(
    message: string,
    questions: Q,
  ): Promise<Record<Extract<keyof Q, string>, string>> {
    const responseId = Date.now() * 100 + Math.floor(Math.random() * 100);
    const promise = new Promise<Record<Extract<keyof Q, string>, string>>(
      (resolve) => {
        this.userInputResolvers.set(responseId, resolve as any);
      },
    );
    ToRendererIpc.toUser.send(this.mainWindow.webContents, {
      type: 'prompt',
      message,
      questions,
      responseId,
    });
    return promise;
  }

  async runPrompt(
    requestId: number,
    prompt: string,
    args?: Record<string, string>,
    attachments?: PromptAttachment[],
    reasoningEffort?: LlmApi.ReasoningEffort,
    modelType?: LlmApi.LlmModelType,
    frameId?: number,
  ): Promise<string | undefined> {
    const tab = typeof frameId === 'number' ? this.getTab(frameId) : undefined;
    const target = tab ?? this.focusedTab ?? this.getAnyTab();
    if (!target) return 'Tab not found';

    if (prompt === 'run test' && testPrompt) {
      const promises: Promise<string>[] = [];
      for (let i = 0; i < 3; i++) {
        const stream = LlmApi.queryLLMApi(
          testPrompt.user,
          testPrompt.system,
          null,
          `test_${Date.now()}_${i}`,
          'mid',
          'low',
        );
        promises.push(LlmApi.wrapStream(stream).catch((e) => e.message));
      }
      const result: string[] = await Promise.all(promises);
      console.info(
        'result:',
        `${app.getPath('userData')}/prompt-lab/test${new Date().toISOString().replace(/[^0-9]/g, '')}.json`,
        result,
      );
      try {
        fs.mkdirSync(`${app.getPath('userData')}/prompt-lab`);
      } catch (e) {
        console.log(e);
      }
      try {
        fs.writeFileSync(
          `${app.getPath('userData')}/prompt-lab/test${new Date().toISOString().replace(/[^0-9]/g, '')}.json`,
          JSON.stringify(result, null, 2),
        );
      } catch (e) {
        console.log(e);
      }
      return undefined;
    }

    try {
      if (!target) return 'Tab not found';
      const stream = this.startPrompt(
        requestId,
        target,
        prompt,
        args,
        attachments, // attachments
        reasoningEffort,
        modelType,
      );
      let response;
      console.info('stream:', stream);
      while ((response = await stream.next())) {
        if (!response.done) {
          console.info('pushPromptResponse:', response.value);
          target.pushPromptResponse(requestId, response.value);
        } else {
          break;
        }
      }
    } catch (e) {
      console.error('runPrompt error:', e);
      return Util.formatError(e);
    }
    return undefined;
  }

  startPrompt(
    requestId: number,
    tab: TabWebView,
    promptTxt: string,
    args?: Record<string, string>,
    attachments?: PromptAttachment[],
    reasoningEffort?: LlmApi.ReasoningEffort,
    modelType?: LlmApi.LlmModelType,
  ) {
    const existing = this.runsByRequestId.get(requestId);
    if (existing) existing.stop();

    const run = new PromptRun(this, tab, requestId);
    attachments
      ?.filter((a) => !!a.data)
      .forEach((a) => {
        this.readableFiles.set(a.name, a);
      });
    this.runsByRequestId.set(requestId, run);
    this.lastStartedRequestId = requestId;
    this.scheduleSnapshotEmit();
    return run.initPrompt(
      promptTxt,
      args,
      reasoningEffort,
      modelType,
      attachments?.map((f) => f.name),
    );
  }

  stopPrompt(requestId?: number) {
    const id = requestId ?? this.lastStartedRequestId;
    if (id === null) return { stopped: false, error: 'No prompt to stop' };
    const run = this.runsByRequestId.get(id);
    if (!run) return { stopped: false, error: 'Prompt not found' };

    run.stop();
    this.runQueue = this.runQueue.filter((v) => v !== id);
    if (this.activeRequestId === id) {
      this.activeRequestId = null;
      this.inFlightAction = false;
    }
    this.cleanupActionMapForRequest(id);
    this.scheduleSnapshotEmit();
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
            this.scheduleSnapshotEmit();
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
      this.scheduleSnapshotEmit();
    }
    this.pump();
  }

  actionDone(actionId: number, argsDelta?: Record<string, string> | undefined) {
    const requestId = this.actionIdToRequestId.get(actionId);
    if (requestId === undefined) return;
    const run = this.runsByRequestId.get(requestId);
    if (!run) return;
    run.actionDone(actionId, argsDelta);
    if (this.activeRequestId === requestId) {
      this.inFlightAction = false;
      this.pump();
    }
    this.scheduleSnapshotEmit();
  }

  actionError(actionId: number, error: string) {
    const requestId = this.actionIdToRequestId.get(actionId);
    if (requestId === undefined) return;
    const run = this.runsByRequestId.get(requestId);
    if (!run) return;
    run.actionError(actionId, error);
  }

  notifySnapshotChanged() {
    this.scheduleSnapshotEmit();
  }

  private async confirmAndDispatchHighRiskAction(
    requestId: number,
    run: PromptRun,
    nextAction: WireActionWithWaitAndRec,
  ) {
    try {
      const approved = await run.tab.confirmHighRiskAction(
        nextAction.intent ?? 'High risk action',
      );
      if (!approved) {
        this.stopPrompt(requestId);
        return;
      }
      // Keep `inFlightAction = true` until actionDone/actionError arrives.
      run.tab.pushActions([nextAction], run.args);
    } catch (err) {
      console.error('High risk approval failed:', err);
      this.stopPrompt(requestId);
    }
  }

  private collectArgKeysFromValue(value: unknown, keys: Set<string>) {
    if (typeof value === 'string') {
      const rx = /\$\{args\.([a-zA-Z0-9_]+)\}/g;
      let match: RegExpExecArray | null;
      while ((match = rx.exec(value))) {
        if (match[1]) keys.add(match[1]);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => this.collectArgKeysFromValue(v, keys));
      return;
    }
    if (!value || typeof value !== 'object') return;

    const anyValue = value as any;
    if (Array.isArray(anyValue.argKeys)) {
      anyValue.argKeys.forEach((k: unknown) => {
        if (typeof k === 'string' && k.trim()) keys.add(k);
      });
    }

    Object.values(anyValue).forEach((v) =>
      this.collectArgKeysFromValue(v, keys),
    );
  }

  private getMissingArgKeys(
    run: PromptRun,
    nextAction: WireActionWithWaitAndRec,
  ) {
    const keys = new Set<string>();
    this.collectArgKeysFromValue(nextAction.action, keys);
    this.collectArgKeysFromValue(nextAction.pre, keys);
    this.collectArgKeysFromValue(nextAction.post, keys);
    return Array.from(keys).filter((k) => {
      const v = (run.args as any)?.[k];
      if (v === undefined || v === null) return true;
      return String(v).trim().length === 0;
    });
  }

  private async ensureArgsForAction(
    requestId: number,
    run: PromptRun,
    _nextAction: WireActionWithWaitAndRec,
  ) {
    const missingKeys = new Set<string>();
    const lookAhead = run.getRemainActions().slice(0, 8);
    for (const action of lookAhead) {
      this.getMissingArgKeys(run, action).forEach((k) => missingKeys.add(k));
    }
    const missing = Array.from(missingKeys);
    if (missing.length === 0) return true;
    const questions = missing.reduce(
      (acc, key) => ({ ...acc, [key]: { type: 'string' as const } }),
      {} as Record<string, { type: 'string' }>,
    );
    const answer = await this.askUserInput(
      `Need input to continue:\n${missing.join('\n')}`,
      questions,
    );
    const values = answer ?? {};
    const allEmpty = Object.values(values).every(
      (v) => !String(v ?? '').trim(),
    );
    if (allEmpty) {
      this.stopPrompt(requestId);
      return false;
    }
    run.args = { ...run.args, ...values };
    return true;
  }

  private async handleBotherUserAction(
    requestId: number,
    run: PromptRun,
    nextAction: WireActionWithWaitAndRec,
  ) {
    try {
      const action: any = nextAction.action as any;
      const missingInfos: string[] = Array.isArray(action.missingInfos)
        ? action.missingInfos
        : [];

      const questions =
        missingInfos.length > 0
          ? missingInfos.reduce(
              (acc, key) => ({ ...acc, [key]: { type: 'string' as const } }),
              {} as Record<string, { type: 'string' }>,
            )
          : { input: { type: 'string' as const } };

      const message =
        typeof action.warn === 'string' && action.warn.trim().length
          ? action.warn
          : 'Input required to continue';

      const answer = await this.askUserInput(message, questions as any);
      const values = answer ?? {};
      const allEmpty = Object.values(values).every(
        (v) => !String(v ?? '').trim(),
      );
      if (allEmpty) {
        this.stopPrompt(requestId);
        return;
      }
      run.args = { ...run.args, ...values };
      this.actionDone(nextAction.id, values);
    } catch (err) {
      console.error('User input failed:', err);
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
        this.scheduleSnapshotEmit();
        this.pump();
        return;
      }
      const nextAction = run.getNextAction();
      if (!nextAction) return;
      this.inFlightAction = true;
      this.dispatchAction(nextAction, this.activeRequestId!, run);
    }

    while (this.runQueue.length) {
      const requestId = this.runQueue.shift()!;
      const run = this.runsByRequestId.get(requestId);
      if (!run || run.stopRequested) continue;
      const nextAction = run.getNextAction();
      if (!nextAction) continue;

      this.activeRequestId = requestId;
      this.inFlightAction = true;
      this.scheduleSnapshotEmit();
      this.dispatchAction(nextAction, requestId, run);
    }
  }

  private dispatchAction(
    nextAction: WireActionWithWaitAndRec,
    requestId: number,
    run: PromptRun,
  ) {
    if ((nextAction.action as any)?.k === 'tab') {
      this.handleTabAction(
        nextAction.id,
        nextAction.action as WireTabAction,
        run.args,
      );
      return;
    }
    if ((nextAction.action as any)?.k === 'botherUser') {
      this.handleBotherUserAction(requestId, run, nextAction);
      return;
    }
    (async () => {
      // const ok = await this.ensureArgsForAction(requestId, run, nextAction);
      // if (!ok) return;
      // if (DEBUG_CONFIRM_ALL_ACTIONS || nextAction.risk === 'h') {
      //   await this.confirmAndDispatchHighRiskAction(requestId, run, nextAction);
      //   return;
      // }
      this.focusedTab!.pushActions([nextAction], run.args);
    })();
  }

  private cleanupActionMapForRequest(requestId: number) {
    for (const [actionId, owner] of this.actionIdToRequestId.entries()) {
      if (owner === requestId) this.actionIdToRequestId.delete(actionId);
    }
  }

  private scheduleSnapshotEmit() {
    if (this.snapshotTimer) {
      this.snapshotPending = true;
      return;
    }
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      this.snapshotPending = false;
      this.focusedTab?.emitLlmSessionSnapshot(this.getSnapshot());
      if (this.snapshotPending) {
        this.scheduleSnapshotEmit();
      }
    }, 150);
  }

  getSnapshot() {
    const runs = Array.from(this.runsByRequestId.values())
      .slice()
      .sort((a, b) => a.requestId - b.requestId)
      .map((run) => ({
        requestId: run.requestId,
        stopRequested: run.stopRequested,
        args: run.args,
        actions: run.actions.map((action) => ({
          id: action.id,
          intent: action.intent,
          risk: action.risk,
          done: action.done,
          error: action.error,
          stepPrompt: action.stepPrompt,
          promptId: action.promptId,
          argsDelta: action.argsDelta,
          action: action.action,
        })),
        currentAction: run.currentAction,
        prompts: run.prompts.map((prompt) => ({
          id: prompt.id,
          parentId: prompt.parentId,
          sessionId: prompt.sessionId,
          goalPrompt: prompt.goalPrompt,
          subPrompt: prompt.subPrompt,
          argsAdded: prompt.argsAdded ?? null,
          complexity: prompt.complexity,
        })),
        breakPromptForExeErr: run.breakPromptForExeErr,
        fixingAction: run.fixingAction.length
          ? run.fixingAction.map((f) => ({
              actionId: f.action.id,
              offset: f.offset,
              promptId: f.promptId,
            }))
          : [],
        sessionQueue: run.sessionQueue.map((session) => ({
          id: session.id,
          parentId: session.parent?.id ?? null,
          promptQueue: session.promptQueue.map((prompt) => ({
            id: prompt.id,
            parentId: prompt.parentId,
            sessionId: prompt.sessionId,
            goalPrompt: prompt.goalPrompt,
            subPrompt: prompt.subPrompt,
            argsAdded: prompt.argsAdded ?? null,
            complexity: prompt.complexity,
          })),
          subSessionQueueIds: session.subSessionQueue.map((s) => s.id),
          breakPromptForExeErr: session.breakPromptForExeErr,
        })),
        runningSessionIds: run.runningSession.map((session) => session.id),
      }));
    return {
      activeRequestId: this.activeRequestId,
      runQueue: [...this.runQueue],
      runs,
    };
  }

  private cleanupTab(frameId: number) {
    const wvTab = this.getTab(frameId);
    if (wvTab) {
      try {
        wvTab.stopPrompt();
      } catch {
        // ignore cleanup errors
      }
      try {
        wvTab.webView.setVisible(false);
      } catch {
        // ignore cleanup errors
      }
      try {
        this.mainWindow?.contentView.removeChildView(wvTab.webView);
      } catch {
        // ignore cleanup errors
      }
      this.unregisterTab(frameId);
    }

    try {
      this.mainWindow?.webContents.send('tab-closed', { frameId });
    } catch {
      // ignore teardown errors
    }
  }

  private handleTabAction(
    actionId: number,
    action: WireTabAction,
    args: Record<string, string>,
  ) {
    ToRendererIpc.tab.send(this.mainWindow.webContents, {
      tabId: action.id,
      url: action.url ? CommonUtil.replaceJsTpl(action.url, args) : undefined,
      actionId,
      triggerFrameId: this.focusedTab!.webView.webContents.id,
    });
  }
}
