import * as React from 'react';
import type { ActionItem, ThinkingItem } from '../../state/agentStore';
import { useAgentStore } from '../../state/agentStore';

type ActionListProps = {
  activeTabId: string | null;
  requestId: number;
};

const riskLabelMap: Record<string, string> = {
  l: 'Low',
  m: 'Medium',
  h: 'High',
};

const statusStyleMap: Record<
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

const thinkingStatusStyleMap: Record<
  ThinkingItem['status'],
  { label: string; className: string }
> = {
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

const getActionSummary = (item: ActionItem) => {
  if (item.intent?.trim()) return item.intent.trim();
  if (item.stepPrompt?.trim()) return item.stepPrompt.trim();
  const action = item.action as { k?: string } | undefined;
  if (action?.k) return `Action: ${action.k}`;
  return 'Action';
};

const formatDuration = (durationMs?: number) => {
  if (!durationMs || durationMs < 0) return '';
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
};

const getThinkingSummary = (item: ThinkingItem) => {
  switch (item.kind) {
    case 'planning':
      return 'Planning';
    case 'planning_output':
      return 'Planning output';
    case 'action_thinking':
      return 'Thinking actions';
    default:
      return 'Thinking';
  }
};

const ThinkingDetails: React.FC<{
  item: ThinkingItem;
  outputContent?: string;
}> = ({ item, outputContent }) => {
  if (item.kind === 'planning') {
    if (item.status === 'running') return null;
    if (!outputContent?.trim()) return null;
  } else if (item.kind === 'action_thinking') {
    if (item.status !== 'done') return null;
    if (!item.content?.trim()) return null;
  } else if (!item.content?.trim()) {
    return null;
  }
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-700">
        {item.kind === 'planning' ? outputContent : item.content}
      </pre>
    </div>
  );
};

const ActionDetails: React.FC<{ item: ActionItem }> = ({ item }) => {
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
      {item.prompt && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Prompt
          </div>
          <div className="mt-1 space-y-1 text-[11px] text-slate-700">
            <div>
              <span className="font-semibold text-slate-600">Goal: </span>
              {item.prompt.goalPrompt}
            </div>
            {item.prompt.subPrompt && (
              <div>
                <span className="font-semibold text-slate-600">Sub: </span>
                {item.prompt.subPrompt}
              </div>
            )}
          </div>
        </div>
      )}
      {item.stepPrompt && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Step Prompt
          </div>
          <div className="mt-1 text-[11px] text-slate-700">
            {item.stepPrompt}
          </div>
        </div>
      )}
      {item.prompt?.argsAdded && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Input
          </div>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-slate-700">
            {JSON.stringify(item.prompt.argsAdded, null, 2)}
          </pre>
        </div>
      )}
      {item.argsDelta && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Output
          </div>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-slate-700">
            {JSON.stringify(item.argsDelta, null, 2)}
          </pre>
        </div>
      )}
      {Boolean(item.action) && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Action
          </div>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-slate-700">
            {JSON.stringify(item.action, null, 2)}
          </pre>
        </div>
      )}
      {item.error?.length ? (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Error
          </div>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-rose-700">
            {JSON.stringify(item.error, null, 2)}
          </pre>
        </div>
      ) : null}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Json
        </div>
        <pre className="mt-1 whitespace-pre-wrap warp-break-words font-mono text-[11px] text-slate-700">
          {JSON.stringify(item, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export const ActionList: React.FC<ActionListProps> = ({
  activeTabId,
  requestId,
}) => {
  const items = useAgentStore((state) =>
    activeTabId
      ? (state.actionItemsByTabId[activeTabId] ?? []).filter(
          (item) => item.requestId === requestId,
        )
      : [],
  );
  const thinkingItems = useAgentStore((state) =>
    activeTabId
      ? (state.thinkingItemsByTabId[activeTabId] ?? []).filter(
          (item) => item.requestId === requestId,
        )
      : [],
  );
  const planningOutput = React.useMemo(
    () =>
      thinkingItems.find((item) => item.kind === 'planning_output')?.content ??
      '',
    [thinkingItems],
  );
  const expandedMap = useAgentStore((state) =>
    activeTabId ? (state.expandedActionIdsByTabId[activeTabId] ?? {}) : {},
  );
  const expandedThinkingMap = useAgentStore((state) =>
    activeTabId ? (state.expandedThinkingIdsByTabId[activeTabId] ?? {}) : {},
  );
  const toggleExpanded = useAgentStore((state) => state.toggleActionExpanded);
  const toggleThinkingExpanded = useAgentStore(
    (state) => state.toggleThinkingExpanded,
  );

  if (!items.length && !thinkingItems.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-700 shadow-[0_8px_30px_-20px_rgba(15,23,42,0.35)]">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Agent Steps
        </div>
        <div className="text-[12px] text-slate-500">Waiting for steps...</div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-700 shadow-[0_8px_30px_-20px_rgba(15,23,42,0.35)]">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Agent Steps
      </div>
      {thinkingItems.map((item) => {
        if (item.kind === 'planning_output') return null;
        const statusStyle = thinkingStatusStyleMap[item.status];
        const expanded = Boolean(expandedThinkingMap?.[item.id]);
        const durationLabel = formatDuration(item.durationMs);
        return (
          <div key={item.id} className="rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                if (!activeTabId) return;
                toggleThinkingExpanded(activeTabId, item.id);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-slate-50"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyle.className}`}
                >
                  {statusStyle.label}
                </span>
                <span className="font-medium text-slate-800">
                  {getThinkingSummary(item)}
                </span>
                {durationLabel ? (
                  <span className="text-[10px] text-slate-400">
                    {durationLabel}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] text-slate-400">
                #{item.requestId}
              </span>
            </button>
            {expanded && (
              <ThinkingDetails item={item} outputContent={planningOutput} />
            )}
          </div>
        );
      })}
      {items.map((item) => {
        const statusStyle = statusStyleMap[item.status];
        const expanded = Boolean(expandedMap?.[item.id]);
        return (
          <div key={item.id} className="rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                if (!activeTabId) return;
                toggleExpanded(activeTabId, item.id);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-slate-50"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyle.className}`}
                >
                  {statusStyle.label}
                </span>
                {item.risk && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    {riskLabelMap[item.risk] ?? item.risk}
                  </span>
                )}
                <span className="font-medium text-slate-800">
                  {getActionSummary(item)}
                </span>
              </div>
              <span className="text-[10px] text-slate-400">#{item.id}</span>
            </button>
            {expanded && <ActionDetails item={item} />}
          </div>
        );
      })}
    </div>
  );
};
