/**
 * Agent Store - Zustand store for managing agent state.
 *
 * This store manages:
 * - Chat messages between user and assistant
 * - LLM session snapshots from the main process
 * - Action items derived from session state
 * - Thinking items for planning/execution phases
 * - Prompt runs and their status
 */

import { create } from 'zustand';

import type {
  AgentState,
  Message,
  ThinkingItem,
  ThinkingItemStatus,
} from './types';
import { buildActionItems, buildActionSummary } from './actionUtils';
import {
  closePlanningItemsForActions,
  findLatestRunningItemIndex,
  markThinkingItemsError,
  syncPhaseItemsFromSnapshot,
  updateActionThinkingItems,
} from './thinkingUtils';
import {
  derivePromptRunningStatus,
  syncPromptSteps,
  updatePhaseTimeline,
  updatePromptRunStatusFromSnapshot,
} from './promptUtils';

/**
 * The main agent store instance.
 */
export const useAgentStore = create<AgentState>((set) => ({
  // Initial state
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

  // ---------------------------------------------------------------------------
  // Tab Management
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Message Management
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Session Snapshot Management
  // ---------------------------------------------------------------------------

  setSessionSnapshot: (tabId, snapshot) =>
    set((state) => {
      const items = buildActionItems(snapshot);

      // Update thinking items through the pipeline
      let nextThinkingItems = updateActionThinkingItems(
        state.thinkingItemsByTabId[tabId] ?? [],
        items,
      );
      nextThinkingItems = closePlanningItemsForActions(nextThinkingItems, items);
      nextThinkingItems = syncPhaseItemsFromSnapshot(
        nextThinkingItems,
        snapshot,
        items,
      );

      // Sync prompt steps and runs
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

      // Derive the overall running status
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

  // ---------------------------------------------------------------------------
  // Thinking Item Management
  // ---------------------------------------------------------------------------

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

      // Update planning_output item
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

      // Update planning item
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

      // Create new items if none exist
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

  // ---------------------------------------------------------------------------
  // UI State (Expansion Toggles)
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Prompt Run Management
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Global Status
  // ---------------------------------------------------------------------------

  setPromptRunningStatus: (status) =>
    set(() => ({ promptRunningStatus: status })),

  setRunningRequestId: (id) => set(() => ({ runningRequestId: id })),
}));

