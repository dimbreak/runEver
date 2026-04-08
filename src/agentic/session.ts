import { app, DownloadItem, Rectangle, WebContentsView } from 'electron';
import fs from 'fs';
import { TabWebView } from '../main/webView/tab';
import { LlmApi } from './api';
import { WireActionWithWaitAndRec, Prompt } from './types';
import { ToRendererIpc } from '../contracts/toRenderer';
import type { UrlSuggestionItem } from '../contracts/toMain';
import { Util } from '../webView/util';
import { PromptAttachment } from '../schema/attachments';
import { WireTabAction, RiskOrComplexityLevel } from './execution.schema';
import { CommonUtil } from '../utils/common';
import './addOns/smartAction.registry';
import { RuneverConfigStore } from '../main/runeverConfigStore';
import type { RunEverConfig } from '../schema/runeverConfig';
import { isMac } from '../main/util';
import { estimatePromptComplexity } from '../utils/llm';
import { ExecutionTask } from './task';
import {
  ExecutionMaxRetry,
  PlanAfterNavigation,
  PlanAfterRerender,
} from './constants';
import type { RunEverWindow } from '../main/window';
import { TaskSnapshot, WireActionStatus } from '../schema/taskSnapshot';
import { AddOns } from './addOns/addons';
import { WebSkill } from './addOns/skills/webSkill/webSkill.action';

const testPrompt: { user: string; system: string } | null = {
  user: ``,
  system: ``,
};

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
  private overlayWebView: WebContentsView;
  private overlayReady: Promise<void>;
  private overlayMaskActive = false;
  private overlayDropdownVisible = false;
  private overlayCursorVisible = false;
  private overlayBounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
  private focusedTab: TabWebView | null = null;
  private lastWindowResize: {
    bounds?: Rectangle;
    viewportWidth?: number;
    sidebarWidth?: number;
    tabbarHeight?: number;
  } | null = null;
  private userInputResolvers = new Map<
    number,
    (answer: Record<string, string> | null) => void
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
  ) {
    this.overlayWebView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
      },
    });
    this.overlayWebView.setBackgroundColor('#00000000');
    this.overlayWebView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    this.overlayWebView.setVisible(false);
    this.overlayWebView.webContents.on(
      'console-message',
      (_event, _level, message) => {
        if (!message.startsWith('__RUNEVER_URL_SUGGESTION_CLICK__')) {
          return;
        }
        try {
          const payload = JSON.parse(
            message.slice('__RUNEVER_URL_SUGGESTION_CLICK__'.length),
          ) as { url?: string };
          if (!payload.url) {
            return;
          }
          ToRendererIpc.urlSuggestionAction.send(this.mainWindow.webContents, {
            sessionId: this.id,
            type: 'navigate',
            url: payload.url,
          });
        } catch (error) {
          console.warn('Failed to parse overlay url suggestion action:', error);
        }
      },
    );
    this.mainWindow.contentView.addChildView(this.overlayWebView);
    this.overlayReady = this.overlayWebView.webContents
      .loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(`
          <html>
            <body style="margin:0;background:rgba(0,0,0,0);overflow:hidden;pointer-events:none;">
              <div
                id="runEver-dummy-cursor"
                style="display:none;position:fixed;z-index:9999999;top:0;left:0;width:20px;height:20px;"
              >
                <svg width="20px" height="20px" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" version="1.1">
                  <path style="stroke:#111;stroke-width:4;fill:#ddd;" d="M 5,5 90,30 65,50 95,80 80,95 50,65 30,90 z" />
                </svg>
              </div>
              <div
                id="runEver-url-suggestions"
                style="
                  display:none;
                  position:fixed;
                  top:0;
                  left:0;
                  width:100%;
                  max-height:min(360px, 100vh);
                  overflow:hidden;
                  border-bottom:1px solid rgba(15, 23, 42, 0.12);
                  border-radius:0;
                  background:rgba(255,255,255,0.96);
                  box-shadow:0 18px 44px rgba(15, 23, 42, 0.14);
                  backdrop-filter:blur(18px);
                  color:#0f172a;
                  font-family:'Segoe UI', sans-serif;
                "
              >
                <div
                  id="runEver-url-suggestions-list"
                  style="display:flex;flex-direction:column;overflow:auto;"
                ></div>
              </div>
            </body>
          </html>
        `)}`,
      )
      .then(() =>
        this.overlayWebView.webContents.insertCSS(`
          html, body {
            background: transparent !important;
          }
        `),
      )
      .then(() => undefined)
      .catch(() => undefined);
  }

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

  private getOverlayBounds(bounds?: Rectangle): Rectangle {
    const baseBounds = bounds ??
      this.focusedTab?.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
    return {
      x: baseBounds.x,
      y: 0,
      width: baseBounds.width,
      height: baseBounds.height + baseBounds.y,
    };
  }

  private syncOverlayBounds(bounds?: Rectangle) {
    const nextBounds = this.getOverlayBounds(bounds);
    try {
      this.mainWindow.contentView.removeChildView(this.overlayWebView);
    } catch {
      // ignore if overlay is not attached yet
    }
    this.mainWindow.contentView.addChildView(this.overlayWebView);
    this.overlayBounds = nextBounds;
    this.overlayWebView.setBounds(nextBounds);
    this.syncOverlayVisibility();
  }

  private getOverlayContentOffset() {
    return {
      x: (this.focusedTab?.bounds.x ?? 0) - this.overlayBounds.x,
      y: (this.focusedTab?.bounds.y ?? 0) - this.overlayBounds.y,
    };
  }

  private syncOverlayVisibility() {
    this.overlayWebView.setVisible(
      this.overlayMaskActive || this.overlayDropdownVisible,
    );
  }

  private setOverlayMaskActive(active: boolean, bounds?: Rectangle) {
    this.overlayMaskActive = active;
    this.syncOverlayBounds(bounds);
  }

  showInputOverlay(bounds?: Rectangle) {
    this.overlayDropdownVisible = false;
    this.hideUrlSuggestionsOverlay().catch(() => undefined);
    this.setOverlayMaskActive(true, bounds);
  }

  hideInputOverlay() {
    this.setOverlayMaskActive(false);
    this.setOverlayCursorVisible(false).catch(() => undefined);
  }

  private async setOverlayCursorVisible(
    visible: boolean,
    position?: { x: number; y: number },
  ) {
    this.overlayCursorVisible = visible;
    this.syncOverlayVisibility();
    if (this.overlayWebView.webContents.isDestroyed()) {
      return;
    }
    try {
      await this.overlayReady;
    } catch {
      return;
    }
    if (this.overlayWebView.webContents.isDestroyed()) {
      return;
    }
    const overlayOffset = this.getOverlayContentOffset();
    const nextPosition = position
      ? `{
          x: ${position.x + overlayOffset.x + 1},
          y: ${position.y + overlayOffset.y + 1}
        }`
      : 'null';
    try {
      await this.overlayWebView.webContents.executeJavaScript(`
        (() => {
          const position = ${nextPosition};
          document.documentElement.style.background = 'transparent';
          let body = document.body;
          if (!body) {
            body = document.createElement('body');
            document.documentElement.appendChild(body);
          }
          body.style.margin = '0';
          body.style.background = 'transparent';
          body.style.overflow = 'hidden';
          body.style.pointerEvents = 'none';

          let cursor = document.getElementById('runEver-dummy-cursor');
          if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = 'runEver-dummy-cursor';
            cursor.style.position = 'fixed';
            cursor.style.zIndex = '2147483647';
            cursor.style.width = '20px';
            cursor.style.height = '20px';
            cursor.style.pointerEvents = 'none';
            cursor.innerHTML = '<svg width="20px" height="20px" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" version="1.1"><path style="stroke:#111;stroke-width:4;fill:#ddd;" d="M 5,5 90,30 65,50 95,80 80,95 50,65 30,90 z"/></svg>';
            body.appendChild(cursor);
          }

          cursor.style.display = '${visible ? 'block' : 'none'}';
          if (position) {
            cursor.style.left = position.x + 'px';
            cursor.style.top = position.y + 'px';
          }
        })();
      `);
    } catch (error) {
      console.warn('Failed to update overlay cursor:', error);
    }
  }

  async showUrlSuggestionsOverlay(
    suggestions: UrlSuggestionItem[],
    selectedIndex: number = -1,
  ) {
    this.overlayDropdownVisible = true;
    await this.setOverlayCursorVisible(false);
    this.syncOverlayBounds();
    if (this.overlayWebView.webContents.isDestroyed()) {
      return;
    }
    await this.overlayReady.catch(() => undefined);
    if (this.overlayWebView.webContents.isDestroyed()) {
      return;
    }
    const payload = JSON.stringify(suggestions);
    const safeSelectedIndex = Number.isFinite(selectedIndex)
      ? selectedIndex
      : -1;
    const overlayOffset = this.getOverlayContentOffset();
    await this.overlayWebView.webContents
      .executeJavaScript(
        `
        (() => {
          const suggestions = ${payload};
          const selectedIndex = ${safeSelectedIndex};
          const offset = {
            x: ${overlayOffset.x},
            y: ${overlayOffset.y},
          };
          document.documentElement.style.background = 'transparent';
          let body = document.body;
          if (!body) {
            body = document.createElement('body');
            document.documentElement.appendChild(body);
          }
          body.style.margin = '0';
          body.style.background = 'transparent';
          body.style.overflow = 'hidden';
          body.style.pointerEvents = 'none';

          let container = document.getElementById('runEver-url-suggestions');
          if (!container) {
            container = document.createElement('div');
            container.id = 'runEver-url-suggestions';
            body.appendChild(container);
          }
          let list = document.getElementById('runEver-url-suggestions-list');
          if (!list) {
            list = document.createElement('div');
            list.id = 'runEver-url-suggestions-list';
            container.appendChild(list);
          }
          container.style.cssText = 'display:block;position:fixed;top:' + offset.y + 'px;left:' + offset.x + 'px;width:calc(100% - ' + offset.x + 'px);max-height:min(360px, calc(100vh - ' + offset.y + 'px));overflow:hidden;border-bottom:1px solid rgba(15, 23, 42, 0.12);border-radius:0;background:rgba(255,255,255,0.96);box-shadow:0 18px 44px rgba(15, 23, 42, 0.14);backdrop-filter:blur(18px);color:#0f172a;font-family:"Segoe UI",sans-serif;pointer-events:auto;';
          list.style.cssText = 'display:flex;flex-direction:column;overflow:auto;';
          container.style.display = 'block';
          list.innerHTML = '';

          const createText = (tag, text, style) => {
            const node = document.createElement(tag);
            node.textContent = text;
            node.style.cssText = style;
            return node;
          };

          if (suggestions.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:16px 18px;font-size:13px;color:#64748b;';
            empty.textContent = 'No matches';
            list.appendChild(empty);
            return;
          }

          suggestions.forEach((item, index) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid rgba(148,163,184,0.16);cursor:pointer;background:' + (index === selectedIndex ? 'rgba(37,99,235,0.10)' : 'transparent') + ';';
            row.onclick = () => {
              console.log('__RUNEVER_URL_SUGGESTION_CLICK__' + JSON.stringify({
                url: item.url,
              }));
            };

            const iconWrap = document.createElement('div');
            iconWrap.style.cssText = 'display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:rgba(148,163,184,0.14);overflow:hidden;flex-shrink:0;';
            if (item.icon) {
              const icon = document.createElement('img');
              icon.src = item.icon;
              icon.alt = '';
              icon.style.cssText = 'width:18px;height:18px;object-fit:contain;';
              iconWrap.appendChild(icon);
            } else {
              iconWrap.appendChild(createText('span', item.url.charAt(0).toUpperCase() || '?', 'font-size:12px;font-weight:700;color:#475569;'));
            }

            const textWrap = document.createElement('div');
            textWrap.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:2px;flex:1;';
            textWrap.appendChild(createText('span', item.title || item.url, 'font-size:13px;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'));
            textWrap.appendChild(createText('span', item.url, 'font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'));

            row.appendChild(iconWrap);
            row.appendChild(textWrap);
            list.appendChild(row);
          });
          const lastRow = list.lastElementChild;
          if (lastRow instanceof HTMLElement) {
            lastRow.style.borderBottom = 'none';
          }
        })();
      `,
      )
      .catch((error) => {
        console.warn('Failed to render url suggestions overlay:', error);
      });
  }

  async hideUrlSuggestionsOverlay() {
    this.overlayDropdownVisible = false;
    this.syncOverlayVisibility();
    if (this.overlayWebView.webContents.isDestroyed()) {
      return;
    }
    await this.overlayReady.catch(() => undefined);
    if (this.overlayWebView.webContents.isDestroyed()) {
      return;
    }
    await this.overlayWebView.webContents
      .executeJavaScript(
        `
        (() => {
          const container = document.getElementById('runEver-url-suggestions');
          if (container) {
            container.style.display = 'none';
          }
        })();
      `,
      )
      .catch((error) => {
        console.warn('Failed to hide url suggestions overlay:', error);
      });
  }

  async updateOverlayCursor(x: number, y: number) {
    if (!this.overlayMaskActive || x < 0 || y < 0 || !this.focusedTab) {
      await this.setOverlayCursorVisible(false);
      return;
    }
    this.syncOverlayBounds();
    await this.setOverlayCursorVisible(true, { x, y });
  }

  focusTab(tab: TabWebView) {
    if (this.focusedTab === tab) return;
    if (this.focusedTab && this.focusedTab !== tab) {
      this.focusedTab.blur();
    }
    this.focusedTab = tab;
    this.syncOverlayBounds(tab.bounds);
    if (this.overlayMaskActive && tab.mouseX >= 0 && tab.mouseY >= 0) {
      this.updateOverlayCursor(tab.mouseX, tab.mouseY).catch(() => undefined);
    } else {
      this.setOverlayCursorVisible(false).catch(() => undefined);
    }
    if (this.lastWindowResize) {
      const nextBounds =
        this.lastWindowResize.bounds ??
        this.getSafeBounds({
          sidebarWidth: this.lastWindowResize.sidebarWidth,
          tabbarHeight: this.lastWindowResize.tabbarHeight,
          viewportWidth: this.lastWindowResize.viewportWidth,
        });
      const currentBounds = tab.bounds;
      const boundsChanged =
        currentBounds.x !== nextBounds.x ||
        currentBounds.y !== nextBounds.y ||
        currentBounds.width !== nextBounds.width ||
        currentBounds.height !== nextBounds.height;
      if (boundsChanged) {
        tab.operate(this.lastWindowResize).catch(() => undefined);
      }
    }
  }

  getFocusedTab() {
    return this.focusedTab;
  }

  async onWindowResize(detail: {
    bounds?: Rectangle;
    viewportWidth?: number;
    sidebarWidth?: number;
    tabbarHeight?: number;
  }) {
    this.lastWindowResize = detail;
    const wvTab = this.getFocusedTab();
    if (!wvTab) return { error: 'Tab not found' };
    this.syncOverlayBounds(detail.bounds);
    const response = await wvTab.operate(detail);
    this.syncOverlayBounds(wvTab.bounds);
    if (this.overlayMaskActive && wvTab.mouseX >= 0 && wvTab.mouseY >= 0) {
      await this.updateOverlayCursor(wvTab.mouseX, wvTab.mouseY);
    } else {
      await this.setOverlayCursorVisible(false);
    }
    return { response };
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
      if (this.focusedTab === wvTab) {
        this.focusedTab = null;
      }
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

  resolveUserInput(responseId: number, answer: Record<string, string> | null) {
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
  ): Promise<Record<Extract<keyof Q, string>, string> | null> {
    const responseId = Date.now() * 100 + Math.floor(Math.random() * 100);
    const promise = new Promise<Record<
      Extract<keyof Q, string>,
      string
    > | null>((resolve) => {
      this.userInputResolvers.set(responseId, resolve as any);
    });
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
    } finally {
      this.hideInputOverlay();
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
    this.setOverlayMaskActive(false);
    this.setOverlayCursorVisible(false).catch(() => undefined);
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

  setRunningStatus(task: ExecutionTask) {
    this.runningTasks.unshift(task);
    this.pushSnapshot();
    return () => {
      this.runningTasks = this.runningTasks.filter((s) => s !== task);
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
    if (answer === null) {
      this.stopPrompt();
      return false;
    }
    this.args = { ...this.args, ...answer };
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
      if (answer === null) {
        this.stopPrompt();
        return;
      }
      this.runningTasks[0].notices.push(
        `[User response to previous questions]\nprevious executor: ${action.warn}\n${Object.entries(
          answer,
        )
          .map(([k, v]) => `- ${k}: ${v}`)
          .join(`\n`)}`,
      );
      this.actionDone(nextAction.id);
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
    if (nextAction.action?.k === 'tab') {
      this.handleTabAction(nextAction.id, nextAction.action as WireTabAction);
      return;
    }
    if (nextAction.action.k === 'callWebSkill') {
      const { action } = nextAction;
      WebSkill.callSkillFunction(
        this.getFocusedTab()!.webView.webContents,
        action.href,
        action.fnName,
        action.arg ? CommonUtil.replaceJsTpl(action.arg, this.args) : undefined,
      );
      this.actionDone(nextAction.id);
      return;
    }
    if (nextAction.action?.k === 'botherUser') {
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
      if (this.focusedTab === wvTab) {
        this.focusedTab = null;
        this.setOverlayCursorVisible(false).catch(() => undefined);
        this.syncOverlayBounds();
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
    try {
      this.mainWindow?.contentView.removeChildView(this.overlayWebView);
    } catch {
      // ignore teardown errors
    }
    if (!this.overlayWebView.webContents.isDestroyed()) {
      this.overlayWebView.webContents.close();
    }
    this.mainWindow?.endSession(this.id);
  }
}
