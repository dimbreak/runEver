/**
 * Utility functions for managing prompt runs and prompt steps.
 * Handles status derivation, phase timeline updates, and step synchronisation.
 */

import type {
  ActionItem,
  LlmSessionSnapshot,
  PromptRunItem,
  PromptRunPhase,
  PromptRunStatus,
  PromptRunningStatus,
  PromptStepItem,
  ThinkingItem,
} from './types';

/**
 * Synchronises prompt steps from thinking and action items.
 * Creates step entries for each thinking item (except planning_output)
 * and each non-queued action item.
 */
export const syncPromptSteps = (
  steps: PromptStepItem[],
  thinkingItems: ThinkingItem[],
  actionItems: ActionItem[],
): PromptStepItem[] => {
  let changed = false;
  let next = steps;
  const now = Date.now();
  const stepIds = new Set(steps.map((item) => item.id));

  // Add thinking steps
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

  // Add action steps
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

/**
 * Derives the status of a prompt run based on the session state.
 */
export const derivePromptRunStatus = (
  item: PromptRunItem,
  run: LlmSessionSnapshot['runs'][number],
  snapshot: LlmSessionSnapshot,
  thinkingItems: ThinkingItem[],
): PromptRunStatus => {
  if (run.stopRequested) return 'error';

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

  if (anyActionError) return 'error';
  if (planningRunning) return 'planning';
  if (hasActions && !allActionsFinished) return 'running';
  if (isActiveOrQueued) return 'planning';
  if (!hasActions || allActionsFinished) return 'completed';

  return item.status;
};

/**
 * Updates the phase timeline when the status changes.
 * Manages transitions between planning and running phases.
 */
export const updatePhaseTimeline = (
  phases: PromptRunPhase[],
  nextStatus: PromptRunStatus,
  now: number,
): PromptRunPhase[] => {
  const lastPhase = phases[phases.length - 1];

  // Handle transition to planning or running phase
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

  // Handle completion or error - close the last phase
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

/**
 * Updates prompt run statuses based on the session snapshot.
 */
export const updatePromptRunStatusFromSnapshot = (
  runs: PromptRunItem[],
  snapshot: LlmSessionSnapshot | null,
  thinkingItems: ThinkingItem[],
): PromptRunItem[] => {
  if (!snapshot) return runs;

  const runsById = new Map(snapshot.runs.map((run) => [run.requestId, run]));
  const now = Date.now();
  let changed = false;

  const next = runs.map((item) => {
    const run = runsById.get(item.requestId);
    if (!run) return item;

    const nextStatus = derivePromptRunStatus(item, run, snapshot, thinkingItems);
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

/**
 * Derives the overall prompt running status from the session state.
 * Considers active runs, thinking items, action items, and completion state.
 */
export const derivePromptRunningStatus = (
  snapshot: LlmSessionSnapshot | null,
  thinkingItems: ThinkingItem[],
  actionItems: ActionItem[],
  finishedByRequestId: Record<number, boolean>,
): PromptRunningStatus => {
  if (!snapshot) return 'completed';

  const runs = snapshot.runs;

  // Build set of active run IDs
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

  // Check for errors
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
    return 'error';
  }

  // Check for planning state
  const planningActive = thinkingItems.some(
    (item) => item.kind === 'planning' && item.status === 'running',
  );
  if (planningActive) return 'planning';

  // Check for running actions
  const hasPendingActions = actionItems.some(
    (item) => item.status === 'running' || item.status === 'queued',
  );
  if (hasPendingActions) return 'running';

  // Check for thinking state
  const sessionThinkingActive = runs.some(
    (run) =>
      activeRunIds.has(run.requestId) &&
      (run.runningSessionIds.length > 0 ||
        run.sessionQueue.some((session) => session.promptQueue.length > 0) ||
        Boolean(run.fixingAction)),
  );
  if (sessionThinkingActive) return 'thinking';

  const thinkingActive = thinkingItems.some(
    (item) => item.kind === 'action_thinking' && item.status === 'running',
  );
  if (thinkingActive) return 'thinking';

  // Check for active runs
  const hasActiveRun =
    snapshot.activeRequestId !== null || snapshot.runQueue.length > 0;
  if (hasActiveRun) return 'planning';

  // Check if all runs are completed
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

  if (allRunsCompleted) return 'completed';
  if (runs.length > 0) return 'planning';

  return 'completed';
};

