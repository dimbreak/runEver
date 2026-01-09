import * as React from 'react';
import type { ActionItem } from '../../state/agentStore';
import {
  getActionSummary,
  riskLabelMap,
  statusStyleMap,
} from './actionListHelpers';
import { ActionDetails } from './ActionDetails';

type ActionItemRowProps = {
  item: ActionItem;
  expanded: boolean;
  onToggle: () => void;
};

export const ActionItemRow: React.FC<ActionItemRowProps> = ({
  item,
  expanded,
  onToggle,
}) => {
  const statusStyle = statusStyleMap[item.status];
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
};
