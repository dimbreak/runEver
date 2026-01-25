/**
 * Utility functions for managing thinking items.
 * Handles planning phases, action thinking, and phase synchronisation.
 */

import type {
  ActionItem,
  LlmSessionSnapshot,
  ThinkingItem,
  ThinkingItemKind,
  ThinkingItemStatus,
} from './types';
import { buildActionSummary } from './actionUtils';

/**
 * Finds the index of the latest running thinking item of a specific kind.
 * Searches backwards through the array for efficiency.
 */
export const findLatestRunningItemIndex = (
  items: ThinkingItem[],
  requestId: number,
  kind: ThinkingItemKind,
): number => {
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

/**
 * Updates action thinking items when new actions arrive.
 * Marks running action_thinking items as done and updates their content.
 */
export const updateActionThinkingItems = (
  items: ThinkingItem[],
  actionItems: ActionItem[],
): ThinkingItem[] => {
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

/**
 * Closes planning items when actions arrive for a request.
 * Transitions planning and planning_output items to 'done' status.
 */
export const closePlanningItemsForActions = (
  items: ThinkingItem[],
  actionItems: ActionItem[],
): ThinkingItem[] => {
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

/**
 * Marks all running thinking items for a request as error.
 */
export const markThinkingItemsError = (
  items: ThinkingItem[],
  requestId: number,
  errorMessage?: string,
): ThinkingItem[] => {
  if (!items.length) return items;

  const now = Date.now();
  let changed = false;
  const errorDetail =
    errorMessage && errorMessage.trim()
      ? `[error]\n${errorMessage.trim()}`
      : '';

  const next = items.map((item) => {
    if (item.requestId !== requestId || item.status !== 'running') return item;
    changed = true;
    let nextContent = item.content;
    if (errorDetail) {
      if (item.content) {
        nextContent = `${item.content}\n\n${errorDetail}`;
      } else {
        nextContent = errorDetail;
      }
    }
    return {
      ...item,
      status: 'error' as const,
      endedAt: now,
      durationMs: now - item.startedAt,
      updatedAt: now,
      content: nextContent,
    };
  });

  return changed ? next : items;
};

/**
 * Synchronises thinking items based on the session snapshot.
 * Creates and updates phase items (planning, action_thinking, running)
 * based on the current state of each run.
 */
export const syncPhaseItemsFromSnapshot = (
  items: ThinkingItem[],
  snapshot: LlmSessionSnapshot | null,
  actionItems: ActionItem[],
): ThinkingItem[] => {
  if (!snapshot) return items;

  let changed = false;
  let next = items;
  const now = Date.now();

  // Group action items by request ID for efficient lookup
  const actionItemsByRequestId = new Map<number, ActionItem[]>();
  actionItems.forEach((item) => {
    const prev = actionItemsByRequestId.get(item.requestId);
    if (prev) {
      prev.push(item);
    } else {
      actionItemsByRequestId.set(item.requestId, [item]);
    }
  });

  /**
   * Helper to close running items of specific kinds for a request.
   */
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

  /**
   * Helper to find the latest phase item for a request.
   */
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

  // Process each run in the snapshot
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

    // Handle error states
    if (run.stopRequested || hasActionError) {
      closeRunningItems(
        requestId,
        ['planning', 'action_thinking', 'running'],
        'error',
      );
      return;
    }

    // Determine current phase
    const phase: 'planning' | 'thinking' | 'running' | null = (() => {
      if (hasPendingActions) return 'running';
      if (isThinkingSessionActive) return 'thinking';
      if (isPlanningQueued) return 'planning';
      return null;
    })();

    // Handle planning phase
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

    // Handle thinking phase
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

    // Handle running phase
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

    // No active phase - close all running items
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
