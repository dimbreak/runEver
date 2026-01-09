import type { ActionItem, ThinkingItem } from '../../state/agentStore';

export const riskLabelMap: Record<string, string> = {
  l: 'Low',
  m: 'Medium',
  h: 'High',
};

export const statusStyleMap: Record<
  ActionItem['status'],
  { label: string; className: string }
> = {
  queued: {
    label: 'Queued',
    className: 'bg-slate-100 text-slate-600',
  },
  running: {
    label: 'Running',
    className: 'bg-blue-100 text-blue-700',
  },
  done: {
    label: 'Done',
    className: 'bg-emerald-100 text-emerald-700',
  },
  error: {
    label: 'Error',
    className: 'bg-rose-100 text-rose-700',
  },
};

export const thinkingStatusStyleMap: Record<
  ThinkingItem['status'],
  { className: string }
> = {
  running: {
    className: 'bg-blue-100 text-blue-700',
  },
  done: {
    className: 'bg-emerald-100 text-emerald-700',
  },
  error: {
    className: 'bg-rose-100 text-rose-700',
  },
};

export const getActionSummary = (item: ActionItem) => {
  if (item.intent?.trim()) return item.intent.trim();
  if (item.stepPrompt?.trim()) return item.stepPrompt.trim();
  const action = item.action as { k?: string } | undefined;
  if (action?.k) return `Action: ${action.k}`;
  return 'Action';
};

export const formatDuration = (durationMs?: number) => {
  if (!durationMs || durationMs < 0) return '';
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
};

export const getThinkingSummary = (item: ThinkingItem) => {
  switch (item.kind) {
    case 'planning':
      return '';
    case 'planning_output':
      return 'Planning output';
    case 'action_thinking':
      return '';
    case 'running':
      return '';
    default:
      return '';
  }
};

export const getThinkingStatusLabel = (item: ThinkingItem) => {
  const base =
    item.kind === 'planning' || item.kind === 'planning_output'
      ? 'Planning'
      : 'Thinking';
  if (item.status === 'running') return base;
  if (item.status === 'done') return `${base} Result`;
  return `${base} Error`;
};
