import type { JSONContent } from '@tiptap/core';
import { create } from 'zustand';

export type Message = {
  id: number;
  role: 'user' | 'assistant';
  content: JSONContent;
  text?: string;
  llmResponding?: boolean;
  tag?: string;
  image?: string;
  attachments?: Array<{
    name: string;
    mimeType: string;
    size: number;
    data: ArrayBuffer;
  }>;
};

export type LlmSessionSnapshot = {
  frameId: number;
  activeRequestId: number | null;
  runQueue: number[];
  runs: Array<{
    requestId: number;
    stopRequested: boolean;
    args: Record<string, any>;
    actions: Array<{
      id: number;
      intent?: string;
      risk?: string;
      done?: boolean;
      error?: string[];
      stepPrompt?: string;
      promptId?: number;
      argsDelta?: Record<string, string>;
      action?: unknown;
    }>;
    currentAction: number;
    prompts: Array<{
      id: number;
      parentId?: number;
      sessionId?: number;
      goalPrompt: string;
      subPrompt?: string;
      argsAdded?: Record<string, string> | null;
      complexity?: string;
    }>;
    breakPromptForExeErr: boolean;
    fixingAction?: {
      actionId: number;
      offset: number;
      promptId: number;
    } | null;
    sessionQueue: Array<{
      id: number;
      parentId: number | null;
      promptQueue: Array<{
        id: number;
        parentId?: number;
        sessionId?: number;
        goalPrompt: string;
        subPrompt?: string;
        argsAdded?: Record<string, string> | null;
        complexity?: string;
      }>;
      subSessionQueueIds: number[];
      breakPromptForExeErr: boolean;
    }>;
    runningSessionIds: number[];
  }>;
  updatedAt: number;
};

export type ActionItemStatus = 'queued' | 'running' | 'done' | 'error';

export type ActionItem = {
  id: number;
  requestId: number;
  promptId?: number;
  intent?: string;
  risk?: string;
  done?: boolean;
  error?: string[];
  stepPrompt?: string;
  argsDelta?: Record<string, string>;
  action?: unknown;
  prompt?: {
    id: number;
    parentId?: number;
    sessionId?: number;
    goalPrompt: string;
    subPrompt?: string;
    argsAdded?: Record<string, string> | null;
    complexity?: string;
  };
  status: ActionItemStatus;
  updatedAt: number;
};

export type ThinkingItemKind =
  | 'planning'
  | 'planning_output'
  | 'action_thinking';
export type ThinkingItemStatus = 'running' | 'done' | 'error';

export type ThinkingItem = {
  id: string;
  requestId: number;
  kind: ThinkingItemKind;
  status: ThinkingItemStatus;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  content?: string;
  updatedAt: number;
};

export type PromptRunStatus =
  | 'planning'
  | 'planned'
  | 'running'
  | 'completed'
  | 'error';

export type PromptRunItem = {
  requestId: number;
  userMessageId: number;
  status: PromptRunStatus;
  startedAt: number;
  completedAt?: number;
};

type AgentState = {
  messagesByTabId: Record<string, Message[]>;
  sessionByTabId: Record<string, LlmSessionSnapshot | null>;
  actionItemsByTabId: Record<string, ActionItem[]>;
  expandedActionIdsByTabId: Record<string, Record<number, boolean>>;
  thinkingItemsByTabId: Record<string, ThinkingItem[]>;
  expandedThinkingIdsByTabId: Record<string, Record<string, boolean>>;
  promptRunsByTabId: Record<string, PromptRunItem[]>;
  isPromptRunning: boolean;
  runningRequestId: number | null;
  ensureTab: (tabId: string) => void;
  addMessage: (tabId: string, message: Message) => void;
  updateMessage: (
    tabId: string,
    messageId: number,
    updater: (message: Message) => Message,
  ) => void;
  setMessages: (tabId: string, messages: Message[]) => void;
  setSessionSnapshot: (
    tabId: string,
    snapshot: LlmSessionSnapshot | null,
  ) => void;
  startThinking: (tabId: string, requestId: number) => void;
  appendPlanningOutput: (
    tabId: string,
    requestId: number,
    chunk: string,
  ) => void;
  finishPlanning: (tabId: string, requestId: number) => void;
  startActionThinking: (tabId: string, requestId: number) => void;
  markThinkingError: (tabId: string, requestId: number) => void;
  toggleActionExpanded: (tabId: string, actionId: number) => void;
  toggleThinkingExpanded: (tabId: string, thinkingId: string) => void;
  addPromptRun: (
    tabId: string,
    requestId: number,
    userMessageId: number,
  ) => void;
  setPromptRunStatus: (
    tabId: string,
    requestId: number,
    status: PromptRunStatus,
  ) => void;
  setIsPromptRunning: (running: boolean) => void;
  setRunningRequestId: (id: number | null) => void;
  clearTab: (tabId: string) => void;
};

const getActionStatus = (
  snapshot: LlmSessionSnapshot,
  run: LlmSessionSnapshot['runs'][number],
  action: LlmSessionSnapshot['runs'][number]['actions'][number],
  actionIndex: number,
): ActionItemStatus => {
  if (action.error?.length) return 'error';
  if (action.done) return 'done';
  if (
    snapshot.activeRequestId === run.requestId &&
    actionIndex === run.currentAction
  )
    return 'running';
  return 'queued';
};

const buildActionItems = (
  snapshot: LlmSessionSnapshot | null,
): ActionItem[] => {
  if (!snapshot) return [];
  const items: ActionItem[] = [];
  snapshot.runs.forEach((run) => {
    const promptMap = new Map<number, ActionItem['prompt']>();
    run.prompts.forEach((prompt) => {
      promptMap.set(prompt.id, { ...prompt });
    });
    run.actions.forEach((action, index) => {
      const prompt = action.promptId
        ? promptMap.get(action.promptId)
        : undefined;
      items.push({
        id: action.id,
        requestId: run.requestId,
        promptId: action.promptId,
        intent: action.intent,
        risk: action.risk,
        done: action.done,
        error: action.error,
        stepPrompt: action.stepPrompt,
        argsDelta: action.argsDelta,
        action: action.action,
        prompt,
        status: getActionStatus(snapshot, run, action, index),
        updatedAt: snapshot.updatedAt,
      });
    });
  });
  return items.sort((a, b) => a.id - b.id);
};

const updateActionThinkingItems = (
  items: ThinkingItem[],
  actionItems: ActionItem[],
) => {
  if (!items.length) return items;
  const actionRequestIds = new Set(actionItems.map((item) => item.requestId));
  const responseByRequestId = new Map<number, string>();
  actionRequestIds.forEach((requestId) => {
    const summary = actionItems
      .filter((item) => item.requestId === requestId)
      .map((item) => ({
        id: item.id,
        status: item.status,
        intent: item.intent,
        error: item.error,
        argsDelta: item.argsDelta,
        action: item.action,
      }));
    responseByRequestId.set(
      requestId,
      JSON.stringify({ actions: summary }, null, 2),
    );
  });
  let changed = false;
  const next = items.map((item) => {
    if (
      item.kind === 'action_thinking' &&
      item.status === 'running' &&
      actionRequestIds.has(item.requestId)
    ) {
      const endedAt = Date.now();
      changed = true;
      return {
        ...item,
        status: 'done' as const,
        content: responseByRequestId.get(item.requestId) ?? item.content,
        endedAt,
        durationMs: endedAt - item.startedAt,
        updatedAt: endedAt,
      };
    }
    return item;
  });
  return changed ? next : items;
};

const closePlanningItemsForActions = (
  items: ThinkingItem[],
  actionItems: ActionItem[],
) => {
  if (!items.length || !actionItems.length) return items;
  const actionRequestIds = new Set(actionItems.map((item) => item.requestId));
  let changed = false;
  const now = Date.now();
  const next = items.map((item) => {
    if (
      (item.kind === 'planning' || item.kind === 'planning_output') &&
      item.status === 'running' &&
      actionRequestIds.has(item.requestId)
    ) {
      changed = true;
      if (item.kind === 'planning') {
        return {
          ...item,
          status: 'done' as const,
          endedAt: now,
          durationMs: now - item.startedAt,
          updatedAt: now,
        };
      }
      return {
        ...item,
        status: 'done' as const,
        updatedAt: now,
      };
    }
    return item;
  });
  return changed ? next : items;
};

const markThinkingItemsError = (items: ThinkingItem[], requestId: number) => {
  if (!items.length) return items;
  const now = Date.now();
  let changed = false;
  const next = items.map((item) => {
    if (item.requestId !== requestId || item.status !== 'running') return item;
    changed = true;
    return {
      ...item,
      status: 'error' as const,
      endedAt: now,
      durationMs: now - item.startedAt,
      updatedAt: now,
    };
  });
  return changed ? next : items;
};

const derivePromptRunStatus = (
  item: PromptRunItem,
  run: LlmSessionSnapshot['runs'][number],
  snapshot: LlmSessionSnapshot,
  thinkingItems: ThinkingItem[],
) => {
  if (run.stopRequested) return 'error' as const;
  const thinkingForRun = thinkingItems.filter(
    (thinking) => thinking.requestId === run.requestId,
  );
  const planningItem = thinkingForRun.find(
    (thinking) => thinking.kind === 'planning',
  );
  const planningRunning = planningItem?.status === 'running';
  const planningDone = planningItem?.status === 'done';
  const hasActions = run.actions.length > 0;
  const anyActionError = run.actions.some((action) => action.error?.length);
  const allActionsFinished = hasActions
    ? run.actions.every((action) => action.done || action.error?.length)
    : false;
  if (planningRunning) return 'planning' as const;
  if (anyActionError) return 'error' as const;
  if (hasActions) {
    if (allActionsFinished) return 'completed' as const;
    return 'running' as const;
  }
  if (planningDone) {
    const isActiveOrQueued =
      snapshot.activeRequestId === run.requestId ||
      snapshot.runQueue.includes(run.requestId);
    return isActiveOrQueued ? ('planned' as const) : ('completed' as const);
  }
  return item.status;
};

const updatePromptRunStatusFromSnapshot = (
  runs: PromptRunItem[],
  snapshot: LlmSessionSnapshot | null,
  thinkingItems: ThinkingItem[],
) => {
  if (!snapshot) return runs;
  const runsById = new Map(snapshot.runs.map((run) => [run.requestId, run]));
  const now = Date.now();
  let changed = false;
  const next = runs.map((item) => {
    const run = runsById.get(item.requestId);
    if (!run) return item;
    const nextStatus = derivePromptRunStatus(
      item,
      run,
      snapshot,
      thinkingItems,
    );
    if (nextStatus === item.status) return item;
    changed = true;
    return {
      ...item,
      status: nextStatus,
      completedAt:
        nextStatus === 'completed' || nextStatus === 'error'
          ? now
          : undefined,
    };
  });
  return changed ? next : runs;
};

export const useAgentStore = create<AgentState>((set) => ({
  messagesByTabId: {},
  sessionByTabId: {},
  actionItemsByTabId: {},
  expandedActionIdsByTabId: {},
  thinkingItemsByTabId: {},
  expandedThinkingIdsByTabId: {},
  promptRunsByTabId: {},
  isPromptRunning: false,
  runningRequestId: null,
  ensureTab: (tabId) =>
    set((state) => {
      if (state.messagesByTabId[tabId]) return state;
      return {
        messagesByTabId: { ...state.messagesByTabId, [tabId]: [] },
        actionItemsByTabId: { ...state.actionItemsByTabId, [tabId]: [] },
        expandedActionIdsByTabId: {
          ...state.expandedActionIdsByTabId,
          [tabId]: {},
        },
        thinkingItemsByTabId: {
          ...state.thinkingItemsByTabId,
          [tabId]: [],
        },
        expandedThinkingIdsByTabId: {
          ...state.expandedThinkingIdsByTabId,
          [tabId]: {},
        },
        promptRunsByTabId: {
          ...state.promptRunsByTabId,
          [tabId]: [],
        },
      };
    }),
  addMessage: (tabId, message) =>
    set((state) => {
      const prev = state.messagesByTabId[tabId] ?? [];
      return {
        messagesByTabId: {
          ...state.messagesByTabId,
          [tabId]: [...prev, message],
        },
      };
    }),
  updateMessage: (tabId, messageId, updater) =>
    set((state) => {
      const prev = state.messagesByTabId[tabId] ?? [];
      return {
        messagesByTabId: {
          ...state.messagesByTabId,
          [tabId]: prev.map((m) => (m.id === messageId ? updater(m) : m)),
        },
      };
    }),
  setMessages: (tabId, messages) =>
    set((state) => ({
      messagesByTabId: { ...state.messagesByTabId, [tabId]: messages },
    })),
  setSessionSnapshot: (tabId, snapshot) =>
    set((state) => {
      const items = buildActionItems(snapshot);
      const nextThinkingItems = closePlanningItemsForActions(
        updateActionThinkingItems(
          state.thinkingItemsByTabId[tabId] ?? [],
          items,
        ),
        items,
      );
      const nextPromptRuns = updatePromptRunStatusFromSnapshot(
        state.promptRunsByTabId[tabId] ?? [],
        snapshot,
        nextThinkingItems,
      );
      return {
        sessionByTabId: { ...state.sessionByTabId, [tabId]: snapshot },
        actionItemsByTabId: {
          ...state.actionItemsByTabId,
          [tabId]: items,
        },
        thinkingItemsByTabId: {
          ...state.thinkingItemsByTabId,
          [tabId]: nextThinkingItems,
        },
        promptRunsByTabId: {
          ...state.promptRunsByTabId,
          [tabId]: nextPromptRuns,
        },
        expandedActionIdsByTabId: {
          ...state.expandedActionIdsByTabId,
          [tabId]:
            state.expandedActionIdsByTabId[tabId] === undefined
              ? {}
              : Object.fromEntries(
                  items
                    .map((item) => item.id)
                    .filter((id) => state.expandedActionIdsByTabId[tabId]?.[id])
                    .map((id) => [id, true]),
                ),
        },
      };
    }),
  startThinking: (tabId, requestId) =>
    set((state) => {
      const startedAt = Date.now();
      const planningId = `${requestId}-planning`;
      const outputId = `${requestId}-planning-output`;
      const prev = state.thinkingItemsByTabId[tabId] ?? [];
      const next = prev.filter(
        (item) =>
          item.requestId !== requestId ||
          (item.kind !== 'planning' && item.kind !== 'planning_output'),
      );
      next.push(
        {
          id: planningId,
          requestId,
          kind: 'planning',
          status: 'running',
          startedAt,
          updatedAt: startedAt,
        },
        {
          id: outputId,
          requestId,
          kind: 'planning_output',
          status: 'running',
          startedAt,
          content: '',
          updatedAt: startedAt,
        },
      );
      return {
        thinkingItemsByTabId: {
          ...state.thinkingItemsByTabId,
          [tabId]: next,
        },
      };
    }),
  appendPlanningOutput: (tabId, requestId, chunk) =>
    set((state) => {
      const outputId = `${requestId}-planning-output`;
      const prev = state.thinkingItemsByTabId[tabId] ?? [];
      const now = Date.now();
      let updated = false;
      const next = prev.map((item) => {
        if (item.id !== outputId) return item;
        updated = true;
        return {
          ...item,
          content: `${item.content ?? ''}${chunk}`,
          updatedAt: now,
        };
      });
      if (!updated) {
        next.push({
          id: outputId,
          requestId,
          kind: 'planning_output',
          status: 'running',
          startedAt: now,
          content: chunk,
          updatedAt: now,
        });
      }
      return {
        thinkingItemsByTabId: {
          ...state.thinkingItemsByTabId,
          [tabId]: next,
        },
      };
    }),
  finishPlanning: (tabId, requestId) =>
    set((state) => {
      const planningId = `${requestId}-planning`;
      const outputId = `${requestId}-planning-output`;
      const now = Date.now();
      const prev = state.thinkingItemsByTabId[tabId] ?? [];
      const next = prev.map((item) => {
        if (item.id === planningId) {
          if (item.status !== 'running') return item;
          return {
            ...item,
            status: 'done' as const,
            endedAt: now,
            durationMs: now - item.startedAt,
            updatedAt: now,
          };
        }
        if (item.id === outputId) {
          if (item.status !== 'running') return item;
          return {
            ...item,
            status: 'done' as const,
            updatedAt: now,
          };
        }
        return item;
      });
      return {
        thinkingItemsByTabId: {
          ...state.thinkingItemsByTabId,
          [tabId]: next,
        },
      };
    }),
  startActionThinking: (tabId, requestId) =>
    set((state) => {
      const id = `${requestId}-action-thinking`;
      const prev = state.thinkingItemsByTabId[tabId] ?? [];
      if (prev.some((item) => item.id === id)) return state;
      const startedAt = Date.now();
      const hasActions = (state.actionItemsByTabId[tabId] ?? []).some(
        (item) => item.requestId === requestId,
      );
      const endedAt = hasActions ? startedAt : undefined;
      const responseContent = hasActions
        ? JSON.stringify(
            {
              actions: (state.actionItemsByTabId[tabId] ?? [])
                .filter((item) => item.requestId === requestId)
                .map((item) => ({
                  id: item.id,
                  status: item.status,
                  intent: item.intent,
                  error: item.error,
                  argsDelta: item.argsDelta,
                  action: item.action,
                })),
            },
            null,
            2,
          )
        : undefined;
      return {
        thinkingItemsByTabId: {
          ...state.thinkingItemsByTabId,
          [tabId]: [
            ...prev,
            {
              id,
              requestId,
              kind: 'action_thinking',
              status: hasActions ? 'done' : 'running',
              startedAt,
              endedAt,
              durationMs: endedAt ? 0 : undefined,
              content: responseContent,
              updatedAt: startedAt,
            },
          ],
        },
      };
    }),
  markThinkingError: (tabId, requestId) =>
    set((state) => ({
      thinkingItemsByTabId: {
        ...state.thinkingItemsByTabId,
        [tabId]: markThinkingItemsError(
          state.thinkingItemsByTabId[tabId] ?? [],
          requestId,
        ),
      },
    })),
  toggleActionExpanded: (tabId, actionId) =>
    set((state) => {
      const prev = state.expandedActionIdsByTabId[tabId] ?? {};
      const next = { ...prev, [actionId]: !prev[actionId] };
      return {
        expandedActionIdsByTabId: {
          ...state.expandedActionIdsByTabId,
          [tabId]: next,
        },
      };
    }),
  toggleThinkingExpanded: (tabId, thinkingId) =>
    set((state) => {
      const prev = state.expandedThinkingIdsByTabId[tabId] ?? {};
      const next = { ...prev, [thinkingId]: !prev[thinkingId] };
      return {
        expandedThinkingIdsByTabId: {
          ...state.expandedThinkingIdsByTabId,
          [tabId]: next,
        },
      };
    }),
  addPromptRun: (tabId, requestId, userMessageId) =>
    set((state) => {
      const prev = state.promptRunsByTabId[tabId] ?? [];
      if (prev.some((item) => item.requestId === requestId)) return state;
      return {
        promptRunsByTabId: {
          ...state.promptRunsByTabId,
          [tabId]: [
            ...prev,
            {
              requestId,
              userMessageId,
              status: 'planning',
              startedAt: Date.now(),
            },
          ],
        },
      };
    }),
  setPromptRunStatus: (tabId, requestId, status) =>
    set((state) => {
      const prev = state.promptRunsByTabId[tabId] ?? [];
      const now = Date.now();
      const next = prev.map((item) => {
        if (item.requestId !== requestId) return item;
        if (item.status === status) return item;
        return {
          ...item,
          status,
          completedAt:
            status === 'completed' || status === 'error' ? now : undefined,
        };
      });
      return {
        promptRunsByTabId: {
          ...state.promptRunsByTabId,
          [tabId]: next,
        },
      };
    }),
  setIsPromptRunning: (running) => set(() => ({ isPromptRunning: running })),
  setRunningRequestId: (id) => set(() => ({ runningRequestId: id })),
  clearTab: (tabId) =>
    set((state) => {
      const nextMessages = { ...state.messagesByTabId };
      const nextSessions = { ...state.sessionByTabId };
      const nextActionItems = { ...state.actionItemsByTabId };
      const nextExpanded = { ...state.expandedActionIdsByTabId };
      const nextThinkingItems = { ...state.thinkingItemsByTabId };
      const nextExpandedThinking = { ...state.expandedThinkingIdsByTabId };
      const nextPromptRuns = { ...state.promptRunsByTabId };
      delete nextMessages[tabId];
      delete nextSessions[tabId];
      delete nextActionItems[tabId];
      delete nextExpanded[tabId];
      delete nextThinkingItems[tabId];
      delete nextExpandedThinking[tabId];
      delete nextPromptRuns[tabId];
      return {
        messagesByTabId: nextMessages,
        sessionByTabId: nextSessions,
        actionItemsByTabId: nextActionItems,
        expandedActionIdsByTabId: nextExpanded,
        thinkingItemsByTabId: nextThinkingItems,
        expandedThinkingIdsByTabId: nextExpandedThinking,
        promptRunsByTabId: nextPromptRuns,
      };
    }),
}));
