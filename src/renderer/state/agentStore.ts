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
  | 'action_thinking'
  | 'running';
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

export type PromptRunStatus = 'planning' | 'running' | 'completed' | 'error';

export type PromptRunningStatus =
  | 'planning'
  | 'thinking'
  | 'running'
  | 'completed'
  | 'error';

export type PromptRunPhase = {
  status: 'planning' | 'running';
  startedAt: number;
  endedAt?: number;
};

export type PromptRunItem = {
  requestId: number;
  userMessageId: number;
  status: PromptRunStatus;
  startedAt: number;
  completedAt?: number;
  phases: PromptRunPhase[];
};

export type PromptStepItem =
  | {
      id: string;
      kind: 'thinking';
      requestId: number;
      thinkingId: string;
      startedAt: number;
      updatedAt: number;
    }
  | {
      id: string;
      kind: 'action';
      requestId: number;
      actionId: number;
      startedAt: number;
      updatedAt: number;
    };

type AgentState = {
  messagesByTabId: Record<string, Message[]>;
  sessionByTabId: Record<string, LlmSessionSnapshot | null>;
  actionItemsByTabId: Record<string, ActionItem[]>;
  expandedActionIdsByTabId: Record<string, Record<number, boolean>>;
  thinkingItemsByTabId: Record<string, ThinkingItem[]>;
  expandedThinkingIdsByTabId: Record<string, Record<string, boolean>>;
  promptRunsByTabId: Record<string, PromptRunItem[]>;
  promptStepsByTabId: Record<string, PromptStepItem[]>;
  promptFinishedByTabId: Record<string, Record<number, boolean>>;
  promptRunningStatus: PromptRunningStatus;
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
  markPromptFinished: (tabId: string, requestId: number) => void;
  setPromptRunningStatus: (status: PromptRunningStatus) => void;
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

const findLatestRunningItemIndex = (
  items: ThinkingItem[],
  requestId: number,
  kind: ThinkingItemKind,
) => {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (
      item.requestId === requestId &&
      item.kind === kind &&
      item.status === 'running'
    ) {
      return i;
    }
  }
  return -1;
};

const buildActionSummary = (actionItems: ActionItem[], requestId: number) =>
  JSON.stringify(
    {
      actions: actionItems
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
  );

const updateActionThinkingItems = (
  items: ThinkingItem[],
  actionItems: ActionItem[],
) => {
  if (!items.length) return items;
  const actionRequestIds = new Set(actionItems.map((item) => item.requestId));
  const responseByRequestId = new Map<number, string>();
  actionRequestIds.forEach((requestId) => {
    responseByRequestId.set(
      requestId,
      buildActionSummary(actionItems, requestId),
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

const syncPromptSteps = (
  steps: PromptStepItem[],
  thinkingItems: ThinkingItem[],
  actionItems: ActionItem[],
) => {
  let changed = false;
  let next = steps;
  const now = Date.now();
  const stepIds = new Set(steps.map((item) => item.id));
  thinkingItems.forEach((item) => {
    if (item.kind === 'planning_output') return;
    const id = `thinking:${item.id}`;
    if (stepIds.has(id)) return;
    stepIds.add(id);
    changed = true;
    next = [
      ...next,
      {
        id,
        kind: 'thinking',
        requestId: item.requestId,
        thinkingId: item.id,
        startedAt: item.startedAt ?? now,
        updatedAt: now,
      },
    ];
  });
  actionItems.forEach((item) => {
    if (item.status === 'queued') return;
    const id = `action:${item.id}`;
    if (stepIds.has(id)) return;
    stepIds.add(id);
    changed = true;
    next = [
      ...next,
      {
        id,
        kind: 'action',
        requestId: item.requestId,
        actionId: item.id,
        startedAt: item.updatedAt ?? now,
        updatedAt: now,
      },
    ];
  });
  return changed ? next : steps;
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

const syncPhaseItemsFromSnapshot = (
  items: ThinkingItem[],
  snapshot: LlmSessionSnapshot | null,
  actionItems: ActionItem[],
) => {
  if (!snapshot) return items;
  let changed = false;
  let next = items;
  const now = Date.now();
  const actionItemsByRequestId = new Map<number, ActionItem[]>();
  actionItems.forEach((item) => {
    const prev = actionItemsByRequestId.get(item.requestId);
    if (prev) {
      prev.push(item);
    } else {
      actionItemsByRequestId.set(item.requestId, [item]);
    }
  });

  const closeRunningItems = (
    requestId: number,
    kinds: ThinkingItemKind[],
    status: ThinkingItemStatus,
    contentByKind?: Partial<Record<ThinkingItemKind, string>>,
  ) => {
    const kindSet = new Set(kinds);
    let localChanged = false;
    const updated = next.map((item) => {
      if (
        item.requestId !== requestId ||
        item.status !== 'running' ||
        !kindSet.has(item.kind)
      ) {
        return item;
      }
      localChanged = true;
      return {
        ...item,
        status,
        endedAt: now,
        durationMs: now - item.startedAt,
        updatedAt: now,
        content: contentByKind?.[item.kind] ?? item.content,
      };
    });
    if (localChanged) {
      changed = true;
      next = updated;
    }
  };

  const getLatestPhaseItem = (requestId: number) => {
    for (let i = next.length - 1; i >= 0; i -= 1) {
      const item = next[i];
      if (
        item.requestId === requestId &&
        (item.kind === 'planning' ||
          item.kind === 'action_thinking' ||
          item.kind === 'running')
      ) {
        return item;
      }
    }
    return null;
  };

  snapshot.runs.forEach((run) => {
    const requestId = run.requestId;
    const runActionItems = actionItemsByRequestId.get(requestId) ?? [];
    const hasPendingActions = runActionItems.some(
      (item) => item.status === 'running' || item.status === 'queued',
    );
    const hasActionError = runActionItems.some(
      (item) => item.status === 'error',
    );
    const isThinkingSessionActive =
      run.runningSessionIds.length > 0 ||
      run.sessionQueue.some((session) => session.promptQueue.length > 0) ||
      Boolean(run.fixingAction);
    const isPlanningQueued =
      snapshot.activeRequestId === requestId ||
      snapshot.runQueue.includes(requestId);

    if (run.stopRequested || hasActionError) {
      closeRunningItems(
        requestId,
        ['planning', 'action_thinking', 'running'],
        'error',
      );
      return;
    }

    const phase: 'planning' | 'thinking' | 'running' | null = (() => {
      if (hasPendingActions) return 'running';
      if (isThinkingSessionActive) return 'thinking';
      if (isPlanningQueued) return 'planning';
      return null;
    })();

    if (phase === 'planning') {
      closeRunningItems(requestId, ['action_thinking', 'running'], 'done', {
        running: buildActionSummary(actionItems, requestId),
      });
      const latestPhase = getLatestPhaseItem(requestId);
      if (
        findLatestRunningItemIndex(next, requestId, 'planning') === -1 &&
        latestPhase?.kind !== 'planning'
      ) {
        const startedAt = now;
        const planningId = `${requestId}-planning-${startedAt}`;
        next = [
          ...next,
          {
            id: planningId,
            requestId,
            kind: 'planning',
            status: 'running',
            startedAt,
            content: '',
            updatedAt: startedAt,
          },
        ];
        changed = true;
      }
      return;
    }

    if (phase === 'thinking') {
      closeRunningItems(requestId, ['planning', 'running'], 'done', {
        running: buildActionSummary(actionItems, requestId),
      });
      const latestPhase = getLatestPhaseItem(requestId);
      if (
        findLatestRunningItemIndex(next, requestId, 'action_thinking') === -1 &&
        latestPhase?.kind !== 'action_thinking'
      ) {
        const startedAt = now;
        next = [
          ...next,
          {
            id: `${requestId}-action-thinking-${startedAt}`,
            requestId,
            kind: 'action_thinking',
            status: 'running',
            startedAt,
            updatedAt: startedAt,
          },
        ];
        changed = true;
      }
      return;
    }

    if (phase === 'running') {
      closeRunningItems(requestId, ['planning', 'action_thinking'], 'done');
      const latestPhase = getLatestPhaseItem(requestId);
      if (
        findLatestRunningItemIndex(next, requestId, 'running') === -1 &&
        latestPhase?.kind !== 'running'
      ) {
        const startedAt = now;
        next = [
          ...next,
          {
            id: `${requestId}-running-${startedAt}`,
            requestId,
            kind: 'running',
            status: 'running',
            startedAt,
            updatedAt: startedAt,
          },
        ];
        changed = true;
      }
      return;
    }

    closeRunningItems(
      requestId,
      ['planning', 'action_thinking', 'running'],
      'done',
      {
        running: buildActionSummary(actionItems, requestId),
      },
    );
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
  const hasActions = run.actions.length > 0;
  const anyActionError = run.actions.some((action) => action.error?.length);
  const allActionsFinished = hasActions
    ? run.actions.every((action) => action.done || action.error?.length)
    : false;
  const isActiveOrQueued =
    snapshot.activeRequestId === run.requestId ||
    snapshot.runQueue.includes(run.requestId);
  if (anyActionError) return 'error' as const;
  if (planningRunning) return 'planning' as const;
  if (hasActions && !allActionsFinished) return 'running' as const;
  if (isActiveOrQueued) return 'planning' as const;
  if (!hasActions || allActionsFinished) return 'completed' as const;
  return item.status;
};

const updatePhaseTimeline = (
  phases: PromptRunPhase[],
  nextStatus: PromptRunStatus,
  now: number,
) => {
  const lastPhase = phases[phases.length - 1];
  if (nextStatus === 'planning' || nextStatus === 'running') {
    if (!lastPhase || lastPhase.status !== nextStatus) {
      const updated = (() => {
        if (lastPhase?.endedAt) {
          return phases;
        }
        if (lastPhase) {
          return [...phases.slice(0, -1), { ...lastPhase, endedAt: now }];
        }
        return phases;
      })();
      return [
        ...updated,
        {
          status: nextStatus,
          startedAt: now,
        },
      ];
    }
    return phases;
  }
  if ((nextStatus === 'completed' || nextStatus === 'error') && lastPhase) {
    if (lastPhase.endedAt) return phases;
    return [
      ...phases.slice(0, -1),
      {
        ...lastPhase,
        endedAt: now,
      },
    ];
  }
  return phases;
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
    const nextPhases = updatePhaseTimeline(item.phases, nextStatus, now);
    if (nextStatus === item.status) return item;
    changed = true;
    return {
      ...item,
      status: nextStatus,
      phases: nextPhases,
      completedAt:
        nextStatus === 'completed' || nextStatus === 'error' ? now : undefined,
    };
  });
  return changed ? next : runs;
};

const derivePromptRunningStatus = (
  snapshot: LlmSessionSnapshot | null,
  thinkingItems: ThinkingItem[],
  actionItems: ActionItem[],
  finishedByRequestId: Record<number, boolean>,
) => {
  if (!snapshot) return 'completed' as const;
  const runs = snapshot.runs;
  const activeRunIds = new Set<number>();
  if (snapshot.activeRequestId !== null) {
    const activeRun = runs.find(
      (run) => run.requestId === snapshot.activeRequestId,
    );
    if (activeRun && !activeRun.stopRequested) {
      activeRunIds.add(snapshot.activeRequestId);
    }
  }
  snapshot.runQueue.forEach((id) => {
    const queuedRun = runs.find((run) => run.requestId === id);
    if (queuedRun && !queuedRun.stopRequested) {
      activeRunIds.add(id);
    }
  });
  runs.forEach((run) => {
    if (run.stopRequested) return;
    if (run.runningSessionIds.length > 0) {
      activeRunIds.add(run.requestId);
      return;
    }
    if (run.sessionQueue.some((session) => session.promptQueue.length > 0)) {
      activeRunIds.add(run.requestId);
      return;
    }
    const hasPendingActions = run.actions.some(
      (action) => !action.done && !action.error?.length,
    );
    if (hasPendingActions) activeRunIds.add(run.requestId);
  });
  const hasRunError = runs.some(
    (run) => activeRunIds.has(run.requestId) && run.stopRequested,
  );
  const hasActionError = actionItems.some(
    (item) => activeRunIds.has(item.requestId) && item.status === 'error',
  );
  const hasThinkingError = thinkingItems.some(
    (item) => activeRunIds.has(item.requestId) && item.status === 'error',
  );
  if (hasRunError || hasActionError || hasThinkingError) {
    return 'error' as const;
  }
  const planningActive = thinkingItems.some(
    (item) => item.kind === 'planning' && item.status === 'running',
  );
  if (planningActive) return 'planning' as const;
  const hasPendingActions = actionItems.some(
    (item) => item.status === 'running' || item.status === 'queued',
  );
  if (hasPendingActions) return 'running' as const;
  const sessionThinkingActive = runs.some(
    (run) =>
      activeRunIds.has(run.requestId) &&
      (run.runningSessionIds.length > 0 ||
        run.sessionQueue.some((session) => session.promptQueue.length > 0) ||
        Boolean(run.fixingAction)),
  );
  if (sessionThinkingActive) return 'thinking' as const;
  const thinkingActive = thinkingItems.some(
    (item) => item.kind === 'action_thinking' && item.status === 'running',
  );
  if (thinkingActive) return 'thinking' as const;
  const hasActiveRun =
    snapshot.activeRequestId !== null || snapshot.runQueue.length > 0;
  if (hasActiveRun) return 'planning' as const;
  const allRunsCompleted =
    runs.length > 0 &&
    runs.every((run) => {
      if (run.stopRequested) return true;
      if (run.actions.length === 0) {
        const hasAnyPrompts =
          run.prompts.length > 0 ||
          run.sessionQueue.some((session) => session.promptQueue.length > 0);
        return hasAnyPrompts && Boolean(finishedByRequestId[run.requestId]);
      }
      return run.actions.every((action) => action.done || action.error?.length);
    });
  if (allRunsCompleted) return 'completed' as const;
  if (runs.length > 0) return 'planning' as const;
  return 'completed' as const;
};

export const useAgentStore = create<AgentState>((set) => ({
  messagesByTabId: {},
  sessionByTabId: {},
  actionItemsByTabId: {},
  expandedActionIdsByTabId: {},
  thinkingItemsByTabId: {},
  expandedThinkingIdsByTabId: {},
  promptRunsByTabId: {},
  promptStepsByTabId: {},
  promptFinishedByTabId: {},
  promptRunningStatus: 'completed',
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
        promptStepsByTabId: {
          ...state.promptStepsByTabId,
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
      let nextThinkingItems = updateActionThinkingItems(
        state.thinkingItemsByTabId[tabId] ?? [],
        items,
      );
      nextThinkingItems = closePlanningItemsForActions(
        nextThinkingItems,
        items,
      );
      nextThinkingItems = syncPhaseItemsFromSnapshot(
        nextThinkingItems,
        snapshot,
        items,
      );
      const nextPromptSteps = syncPromptSteps(
        state.promptStepsByTabId[tabId] ?? [],
        nextThinkingItems,
        items,
      );
      const nextPromptRuns = updatePromptRunStatusFromSnapshot(
        state.promptRunsByTabId[tabId] ?? [],
        snapshot,
        nextThinkingItems,
      );
      const nextRunningStatus = derivePromptRunningStatus(
        snapshot,
        nextThinkingItems,
        items,
        state.promptFinishedByTabId[tabId] ?? {},
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
        promptStepsByTabId: {
          ...state.promptStepsByTabId,
          [tabId]: nextPromptSteps,
        },
        promptRunsByTabId: {
          ...state.promptRunsByTabId,
          [tabId]: nextPromptRuns,
        },
        promptFinishedByTabId: {
          ...state.promptFinishedByTabId,
          [tabId]: state.promptFinishedByTabId[tabId] ?? {},
        },
        promptRunningStatus: nextRunningStatus,
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
      const planningId = `${requestId}-planning-${startedAt}`;
      const outputId = `${requestId}-planning-output-${startedAt}`;
      const prev = state.thinkingItemsByTabId[tabId] ?? [];
      const next = [...prev];
      next.push(
        {
          id: planningId,
          requestId,
          kind: 'planning',
          status: 'running',
          startedAt,
          content: '',
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
      const nextSteps = syncPromptSteps(
        state.promptStepsByTabId[tabId] ?? [],
        next,
        state.actionItemsByTabId[tabId] ?? [],
      );
      return {
        thinkingItemsByTabId: {
          ...state.thinkingItemsByTabId,
          [tabId]: next,
        },
        promptStepsByTabId: {
          ...state.promptStepsByTabId,
          [tabId]: nextSteps,
        },
      };
    }),
  appendPlanningOutput: (tabId, requestId, chunk) =>
    set((state) => {
      const prev = state.thinkingItemsByTabId[tabId] ?? [];
      const now = Date.now();
      let outputUpdated = false;
      let planningUpdated = false;
      const next = [...prev];
      const outputIndex = findLatestRunningItemIndex(
        next,
        requestId,
        'planning_output',
      );
      if (outputIndex >= 0) {
        const target = next[outputIndex];
        next[outputIndex] = {
          ...target,
          content: `${target.content ?? ''}${chunk}`,
          updatedAt: now,
        };
        outputUpdated = true;
      }
      const planningIndex = findLatestRunningItemIndex(
        next,
        requestId,
        'planning',
      );
      if (planningIndex >= 0) {
        const target = next[planningIndex];
        next[planningIndex] = {
          ...target,
          content: `${target.content ?? ''}${chunk}`,
          updatedAt: now,
        };
        planningUpdated = true;
      }
      if (!planningUpdated) {
        next.push({
          id: `${requestId}-planning-${now}`,
          requestId,
          kind: 'planning',
          status: 'running',
          startedAt: now,
          content: chunk,
          updatedAt: now,
        });
      }
      if (!outputUpdated) {
        next.push({
          id: `${requestId}-planning-output-${now}`,
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
      const now = Date.now();
      const prev = state.thinkingItemsByTabId[tabId] ?? [];
      const next = prev.map((item) => {
        if (
          item.requestId !== requestId ||
          item.status !== 'running' ||
          (item.kind !== 'planning' && item.kind !== 'planning_output')
        ) {
          return item;
        }
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
      const prev = state.thinkingItemsByTabId[tabId] ?? [];
      const startedAt = Date.now();
      const hasActions = (state.actionItemsByTabId[tabId] ?? []).some(
        (item) => item.requestId === requestId,
      );
      const endedAt = hasActions ? startedAt : undefined;
      const responseContent = hasActions
        ? buildActionSummary(state.actionItemsByTabId[tabId] ?? [], requestId)
        : undefined;
      const nextThinkingItems: ThinkingItem[] = [
        ...prev,
        {
          id: `${requestId}-action-thinking-${startedAt}`,
          requestId,
          kind: 'action_thinking' as const,
          status: (hasActions ? 'done' : 'running') as ThinkingItemStatus,
          startedAt,
          endedAt,
          durationMs: endedAt ? 0 : undefined,
          content: responseContent,
          updatedAt: startedAt,
        },
      ];
      return {
        thinkingItemsByTabId: {
          ...state.thinkingItemsByTabId,
          [tabId]: nextThinkingItems,
        },
        promptStepsByTabId: {
          ...state.promptStepsByTabId,
          [tabId]: syncPromptSteps(
            state.promptStepsByTabId[tabId] ?? [],
            nextThinkingItems,
            state.actionItemsByTabId[tabId] ?? [],
          ),
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
      const now = Date.now();
      const nextStatus = 'planning' as const;
      return {
        promptRunsByTabId: {
          ...state.promptRunsByTabId,
          [tabId]: [
            ...prev,
            {
              requestId,
              userMessageId,
              status: nextStatus,
              startedAt: now,
              phases: [
                {
                  status: 'planning',
                  startedAt: now,
                },
              ],
            },
          ],
        },
        promptRunningStatus: 'planning',
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
          phases: updatePhaseTimeline(item.phases, status, now),
        };
      });
      return {
        promptRunsByTabId: {
          ...state.promptRunsByTabId,
          [tabId]: next,
        },
        promptRunningStatus:
          status === 'error' ? 'error' : state.promptRunningStatus,
      };
    }),
  markPromptFinished: (tabId, requestId) =>
    set((state) => ({
      promptFinishedByTabId: {
        ...state.promptFinishedByTabId,
        [tabId]: {
          ...(state.promptFinishedByTabId[tabId] ?? {}),
          [requestId]: true,
        },
      },
    })),
  setPromptRunningStatus: (status) =>
    set(() => ({ promptRunningStatus: status })),
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
      const nextPromptSteps = { ...state.promptStepsByTabId };
      const nextPromptFinished = { ...state.promptFinishedByTabId };
      delete nextMessages[tabId];
      delete nextSessions[tabId];
      delete nextActionItems[tabId];
      delete nextExpanded[tabId];
      delete nextThinkingItems[tabId];
      delete nextExpandedThinking[tabId];
      delete nextPromptRuns[tabId];
      delete nextPromptSteps[tabId];
      delete nextPromptFinished[tabId];
      return {
        messagesByTabId: nextMessages,
        sessionByTabId: nextSessions,
        actionItemsByTabId: nextActionItems,
        expandedActionIdsByTabId: nextExpanded,
        thinkingItemsByTabId: nextThinkingItems,
        expandedThinkingIdsByTabId: nextExpandedThinking,
        promptRunsByTabId: nextPromptRuns,
        promptStepsByTabId: nextPromptSteps,
        promptFinishedByTabId: nextPromptFinished,
      };
    }),
}));
