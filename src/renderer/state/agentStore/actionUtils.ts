/**
 * Utility functions for managing action items.
 */

import type { ActionItem, ActionItemStatus, LlmSessionSnapshot } from './types';

/**
 * Determines the status of an action based on the current session state.
 */
export const getActionStatus = (
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
  ) {
    return 'running';
  }
  return 'queued';
};

/**
 * Builds a list of action items from the session snapshot.
 * Transforms the raw session data into UI-friendly ActionItem objects.
 */
export const buildActionItems = (
  snapshot: LlmSessionSnapshot | null,
): ActionItem[] => {
  if (!snapshot) return [];

  const items: ActionItem[] = [];

  snapshot.runs.forEach((run) => {
    // Build a map of prompts for quick lookup
    const promptMap = new Map<number, ActionItem['prompt']>();
    run.prompts.forEach((prompt) => {
      promptMap.set(prompt.id, { ...prompt });
    });

    // Transform each action into an ActionItem
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

/**
 * Builds a JSON summary of actions for a specific request.
 * Used for displaying action state in thinking items.
 */
export const buildActionSummary = (
  actionItems: ActionItem[],
  requestId: number,
): string =>
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
