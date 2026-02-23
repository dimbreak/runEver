import { app, DownloadItem, Rectangle } from 'electron';
import fs from 'fs';
import { TabWebView } from '../main/webView/tab';
import { LlmApi } from './api';
import { WireActionWithWaitAndRec, Prompt, WireActionStatus } from './types';
import { ToRendererIpc } from '../contracts/toRenderer';
import { Util } from '../webView/util';
import { PromptAttachment } from '../schema/attachments';
import { WireTabAction, RiskOrComplexityLevel } from './execution.schema';
import { CommonUtil } from '../utils/common';
import './profile/smartAction.registry';
import { RunEverConfig, RuneverConfigStore } from '../main/runeverConfigStore';
import { isMac } from '../main/util';
import { estimatePromptComplexity } from '../utils/llm';
import { ExecutionTask } from './task';
import {
  ExecutionMaxRetry,
  PlanAfterNavigation,
  PlanAfterRerender,
} from './constants';
import type { RunEverWindow } from '../main/window';
import { TaskSnapshot } from '../schema/taskSnapshot';

const testPrompt: { user: string; system: string } | null = null;

export type TabStatus = {
  id: number;
  url: string;
  title: string;
  active: boolean;
};

export type SessionStatus = {
  id: number;
  title: string;
  isRunning: boolean;
  tabs: TabStatus[];
};

export class Session {
  private static readonly PADDING = 0;
  public static readonly DEFAULT_TABBAR_HEIGHT = 83;
  public static readonly DEFAULT_SIDEBAR_WIDTH = 430;

  public readableFiles: Map<string, PromptAttachment> = new Map();

  private tabsById = new Map<number, TabWebView>();
  private focusedTab: TabWebView | null = null;
  private userInputResolvers = new Map<
    number,
    (answer: Record<string, string>) => void
  >();

  // ── Merged PromptRun state (single run) ──────────────────────────
  public requestId: number = -1;
  tabNotes: Record<number, string> = {};
  args: Record<string, any> = {};
  actions: WireActionWithWaitAndRec[] = [];
  currentAction = 0;
  browserActionLock = Util.newLock('browserActionLock');
  browserActionLockOk = false;
  prompts: Prompt[] = [];
  userPrompts: string[] = [];
  rootTask!: ExecutionTask;
  taskQueue: ExecutionTask[] = [];
  runningTasks: ExecutionTask[] = [];
  globalArgs: RunEverConfig['arguments'] = [];
  secretArgs: Record<string, RunEverConfig['arguments'][number]> = {};
  secretJson: string = '[]';
  stopRequested = false;
  breakPromptForExeErr = false;
  fixingAction: {
    action: WireActionWithWaitAndRec;
    offset: number;
    promptId: number;
    sessionId: number;
  }[] = [];
  private nextActionId = 0;
  private hasActiveRun = false;

  constructor(
    public mainWindow: RunEverWindow,
    public id: number,
  ) {}

  // ── Run lifecycle helpers ────────────────────────────────────────

  private resetRunState(requestId: number) {
    this.requestId = requestId;
    this.tabNotes = {};
    this.args = {};
    this.actions = [];
    this.currentAction = 0;
    this.browserActionLock = Util.newLock('browserActionLock');
    this.browserActionLockOk = false;
    this.prompts = [];
    this.taskQueue = [];
    this.runningTasks = [];
    this.stopRequested = false;
    this.breakPromptForExeErr = false;
    this.fixingAction = [];
    this.nextActionId = 0;
    this.hasActiveRun = true;
    this.rootTask = new ExecutionTask('Root', 0, [], this);
    this.taskQueue.push(this.rootTask);
  }

  // ── Tab management (unchanged) ──────────────────────────────────

  registerTab(tab: TabWebView) {
    this.tabsById.set(tab.webView.webContents.id, tab);
    if (tab.bounds.width > 0 && tab.bounds.height > 0) {
      tab.focus();
      if (this.hasActiveRun) {
        this.runningTasks[0]?.addLog(
          `Populated tab and focused [${tab.webView.webContents.getTitle()}]`,
        );
      }
    }
    tab.pushSecret(this.getSecretJson());
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
    const sidebarWidth = opts.sidebarWidth ?? Session.DEFAULT_SIDEBAR_WIDTH;
    const tabbarHeight = opts.tabbarHeight ?? Session.DEFAULT_TABBAR_HEIGHT;

    const win = this.mainWindow?.getBounds();
    const devtoolsWidth = (win?.width ?? 1024) - (opts.viewportWidth ?? 0);
    const width = Math.max(
      320,
      (win?.width ?? 1024) - sidebarWidth - devtoolsWidth - Session.PADDING * 2,
    );
    const height = Math.max(
      320,
      (win?.height ?? 728) -
        tabbarHeight -
        Session.PADDING * 2 -
        (isMac ? 0 : 65),
    );
    return {
      x: Session.PADDING,
      y: tabbarHeight + Session.PADDING,
      width,
      height,
    };
  }

  getPromptRun(): this | null {
    return this.hasActiveRun ? this : null;
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
      wvTab.stopPrompt();
      wvTab.webView.setVisible(false);
      this.mainWindow?.contentView.removeChildView(wvTab.webView);
      this.unregisterTab(frameId);
      if (!wvTab.webView.webContents.isDestroyed()) {
        wvTab.webView.webContents.close();
      }
      response = 'closed';
    } else {
      response = await wvTab.operate(detail);
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
      sessionId: this.id,
    });
    return promise;
  }

  pushUserPrompt(prompt: string) {
    this.userPrompts.push(prompt);
    this.mainWindow.pushSessionUpdate();
  }

  getStatus(): SessionStatus {
    return {
      id: this.id,
      title: this.userPrompts[this.userPrompts.length - 1] ?? 'New session',
      isRunning: this.hasActiveRun && !this.stopRequested,
      tabs: Array.from(this.tabsById.entries()).map(([id, tab]) => {
        const { webContents } = tab.webView;
        return {
          id,
          title: webContents.getTitle(),
          url: webContents.getURL(),
          active: tab.isFocused,
        } as TabStatus;
      }),
    };
  }

  async runPrompt(
    requestId: number,
    prompt: string,
    args?: Record<string, string>,
    attachments?: PromptAttachment[],
    reasoningEffort?: LlmApi.ReasoningEffort,
    modelType?: LlmApi.LlmModelType,
  ): Promise<string | undefined> {
    if (prompt === 'run test' && testPrompt) {
      const promises: Promise<string>[] = [];
      for (let i = 0; i < 3; i++) {
        const stream = await LlmApi.queryLLMApi(
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
      } catch (e) {}
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
      if (this.hasActiveRun) this.stop();

      this.resetRunState(requestId);
      this.setGlobalArgs(
        (await RuneverConfigStore.getInstance().getConfig('arguments')) ?? [],
      );
      attachments
        ?.filter((a) => !!a.data)
        .forEach((a) => {
          this.readableFiles.set(a.name, a);
        });
      this.pushSnapshot();
      this.pushUserPrompt(prompt);
      const stream = await this.initPrompt(
        prompt,
        args,
        reasoningEffort,
        modelType,
        attachments?.map((f) => f.name),
      );
      let response;
      console.info('stream:', stream);
      while ((response = await stream.next())) {
        if (!response.done) {
          console.info('pushPromptResponse:', response.value);
          this.pushPromptResponse(requestId, response.value);
        } else {
          break;
        }
      }
      this.hasActiveRun = false;
      this.requestId = -1;
    } catch (e) {
      console.error('runPrompt error:', e);
      return Util.formatError(e);
    }
    return undefined;
  }

  pushPromptResponse(requestId: number, chunk: string) {
    ToRendererIpc.promptResponse.send(this.mainWindow!.webContents, {
      requestId,
      chunk,
    });
  }

  stopPrompt() {
    if (!this.hasActiveRun)
      return { stopped: false, error: 'No prompt to stop' };
    this.stop();
    this.pushSnapshot();
    return { stopped: true };
  }

  resumeAll() {
    if (!this.hasActiveRun || this.stopRequested) return;
    if (this.getNextAction()) {
      this.ensureRunLocked();
      this.enqueueRun();
    }
  }

  allocActionId() {
    return this.nextActionId++;
  }

  ensureRunLocked() {
    if (!this.hasActiveRun || this.stopRequested) return;
    if (this.browserActionLock.tryLock()) {
      this.browserActionLock.wait
        .then(() => {
          this.pushSnapshot();
          this.pump();
        })
        .catch((err) => {
          console.error('Error waiting for browser action lock:', err);
        });
    }
  }

  enqueueRun() {
    if (!this.hasActiveRun) {
      console.log('no active run');
      return;
    }
    this.pump();
  }

  actionDone(actionId: number, argsDelta?: Record<string, string> | undefined) {
    if (this.actions.length === 0) return;
    const currentAction = this.actions[this.currentAction];
    if (!currentAction || currentAction.id !== actionId) {
      console.warn(
        'Popping actions out of order:',
        actionId,
        this.actions[this.currentAction]?.id,
      );
      return;
    }
    this.currentAction++;
    currentAction.status = WireActionStatus.done;
    const sess =
      this.taskQueue[this.prompts[currentAction.promptId!].sessionId ?? -1];
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
      actionId,
    );
    this.pushSnapshot();
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
    currentAction.status = WireActionStatus.done;
    const sess =
      this.taskQueue[this.prompts[currentAction.promptId!].sessionId ?? -1];
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
    this.pushSnapshot();
    if (this.currentAction < this.actions.length) {
      this.execActions();
    } else {
      this.browserActionLock.delayUnlock(500);
    }
  }

  // ── Merged PromptRun methods ─────────────────────────────────────

  getSecretArg(key: string): string | undefined {
    return this.secretArgs[key]?.value;
  }

  getSecretJson() {
    return this.secretJson;
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
    this.globalArgs.splice(0, this.globalArgs.length, ...args);
    this.secretArgs = args
      .filter((a) => a.isSecret)
      .reduce(
        (acc, a) => {
          acc[a.name] = a;
          return acc;
        },
        {} as Record<string, RunEverConfig['arguments'][number]>,
      );
    this.secretJson = JSON.stringify(this.secretArgs);
    this.pushSecret(this.secretJson);
    console.log('setGlobalArgs', args);
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

    const { rootTask } = this;
    if (true) {
      const prompt: Prompt = this.createPrompt(
        promptTxt,
        args,
        0,
        'l',
        undefined,
        attachment,
      );
      rootTask.promptQueue.push(prompt);
      const stream = rootTask.exec();
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

  get tab(): TabWebView {
    return this.getFocusedTab() ?? this.tabsById.get(0)!;
  }

  tabNote(noteBeforeLeave: string) {
    this.tabNotes[this.tab.frameIds.values().next().value!] = noteBeforeLeave;
  }

  stop() {
    this.stopRequested = true;
    this.fixingAction.splice(0, this.fixingAction.length);
    this.browserActionLock.unlock();
  }

  getNextAction(): WireActionWithWaitAndRec | undefined {
    console.log('pending actions', this.actions.slice(this.currentAction - 1));
    return this.actions[this.currentAction];
  }

  async execActions() {
    if (!this.fixingAction.length) {
      if (this.actions.length > this.currentAction) {
        this.browserActionLockOk = false;
        this.enqueueRun();
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
    this.pushSnapshot();
  }

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
      const session = this.taskQueue[sessionId];
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
    parent: ExecutionTask | undefined = undefined,
  ) {
    const session = new ExecutionTask('', 0, queue, this, parent);
    return this.wrapSession(session);
  }

  wrapSession<S extends ExecutionTask>(session: S): S {
    const sessionId = this.taskQueue.push(session) - 1;
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
    this.pushSnapshot();
  }

  setRunningStatus(session: ExecutionTask) {
    this.runningTasks.unshift(session);
    this.pushSnapshot();
    return () => {
      this.runningTasks = this.runningTasks.filter((s) => s !== session);
      this.pushSnapshot();
    };
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

  private getMissingArgKeys(nextAction: WireActionWithWaitAndRec) {
    const keys = new Set<string>();
    this.collectArgKeysFromValue(nextAction.action, keys);
    this.collectArgKeysFromValue(nextAction.pre, keys);
    this.collectArgKeysFromValue(nextAction.post, keys);
    return Array.from(keys).filter((k) => {
      const v = (this.args as any)?.[k];
      if (v === undefined || v === null) return true;
      return String(v).trim().length === 0;
    });
  }

  private async ensureArgsForAction(_nextAction: WireActionWithWaitAndRec) {
    const missingKeys = new Set<string>();
    const lookAhead = this.getRemainActions().slice(0, 8);
    for (const action of lookAhead) {
      this.getMissingArgKeys(action).forEach((k) => missingKeys.add(k));
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
      this.stopPrompt();
      return false;
    }
    this.args = { ...this.args, ...values };
    return true;
  }

  private async handleBotherUserAction(nextAction: WireActionWithWaitAndRec) {
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
        this.stopPrompt();
        return;
      }
      this.args = { ...this.args, ...values };
      this.actionDone(nextAction.id, values);
    } catch (err) {
      console.error('User input failed:', err);
      this.stopPrompt();
    }
  }

  private pump() {
    if (!this.hasActiveRun || this.stopRequested) {
      console.log('stopRequested or no active run');
      return;
    }
    const nextAction = this.getNextAction();
    if (!nextAction) {
      console.log('no action');
      return;
    }
    this.dispatchAction(nextAction);
  }

  private dispatchAction(nextAction: WireActionWithWaitAndRec) {
    this.browserActionLock.tryLock();
    if ((nextAction.action as any)?.k === 'tab') {
      this.handleTabAction(nextAction.id, nextAction.action as WireTabAction);
      return;
    }
    if ((nextAction.action as any)?.k === 'botherUser') {
      this.handleBotherUserAction(nextAction);
      return;
    }
    (async () => {
      nextAction.status = WireActionStatus.working;
      this.focusedTab!.pushActions([nextAction], this.args);
    })();
  }

  pushSnapshot() {
    ToRendererIpc.toUser.send(this.mainWindow.webContents, {
      type: 'snapshot',
      snapshot: this.getSnapshot(),
      responseId: this.requestId,
      sessionId: this.id,
    });
  }

  getSnapshot(): TaskSnapshot {
    const taskSnapshot = this.rootTask.getSnapshot();
    return {
      ...taskSnapshot,
      status: this.stopRequested ? 'Canceled' : taskSnapshot.status,
      actions: this.actions.map((a) => ({
        id: a.id,
        intent: a.intent ?? '',
        risk: a.risk,
        status: a.status,
        checkPoints: a.cp ?? [],
        errors: a.error,
      })),
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
    action: {
      id: number;
      k: 'tab';
      noteBeforeLeave: string;
      url?: string | null | undefined;
    },
  ) {
    this.tabNote(action.noteBeforeLeave);
    ToRendererIpc.tab.send(this.mainWindow.webContents, {
      tabId: action.id,
      url: action.url
        ? CommonUtil.replaceJsTpl(action.url, this.args)
        : undefined,
      actionId,
      triggerFrameId: this.focusedTab!.webView.webContents.id,
    });
  }

  pushSecret(secretJson: string) {
    Array.from(this.tabsById.values()).forEach((tab) =>
      tab.pushSecret(secretJson),
    );
  }

  downloaded(item: DownloadItem, filename?: string) {
    this.readableFiles.set(filename ?? item.getFilename(), {
      name: filename ?? item.getFilename(),
      mimeType: item.getMimeType(),
      data: null,
      path: item.getSavePath(),
    });
  }

  async end() {
    this.stopPrompt();
    const frameIds = Array.from(this.getTabsById().keys());
    for (const frameId of frameIds) {
      await this.operateTab({ id: frameId, close: true });
    }
    this.mainWindow?.endSession(this.id);
  }
}
