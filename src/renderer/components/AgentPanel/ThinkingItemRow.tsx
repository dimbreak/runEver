import * as React from 'react';
import type { ThinkingItem } from '../../state/agentStore';
import {
  formatDuration,
  getThinkingStatusLabel,
  getThinkingSummary,
  thinkingStatusStyleMap,
} from './actionListHelpers';
import { ThinkingDetails } from './ThinkingDetails';

type ThinkingItemRowProps = {
  item: ThinkingItem;
  outputContent?: string;
  expanded: boolean;
  onToggle: () => void;
};

export const ThinkingItemRow: React.FC<ThinkingItemRowProps> = ({
  item,
  outputContent,
  expanded,
  onToggle,
}) => {
  const statusStyle = thinkingStatusStyleMap[item.status];
  const durationLabel = formatDuration(item.durationMs);
  const summary = getThinkingSummary(item);
  const statusLabel = getThinkingStatusLabel(item);
  return (
    <div className="rounded-xl border border-slate-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyle.className}`}
          >
            {statusLabel}
          </span>
          {summary ? (
            <span className="font-medium text-slate-800">{summary}</span>
          ) : null}
          {durationLabel ? (
            <span className="text-[10px] text-slate-400">{durationLabel}</span>
          ) : null}
        </div>
        <span className="text-[10px] text-slate-400">#{item.requestId}</span>
      </button>
      {expanded && (
        <ThinkingDetails item={item} outputContent={outputContent} />
      )}
    </div>
  );
};
