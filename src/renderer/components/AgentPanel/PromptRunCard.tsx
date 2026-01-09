import * as React from 'react';
import type { PromptRunItem } from '../../state/agentStore';
import { ActionList } from './ActionList';
import { PromptRunStatusLabel } from './PromptRunStatus';
import { cn } from '../../utils/cn';

type PromptRunCardProps = {
  activeTabId: string | null;
  run: PromptRunItem;
  stepCount: number;
  promptRunningStatus:
    | 'planning'
    | 'thinking'
    | 'running'
    | 'completed'
    | 'error';
};

export const PromptRunCard: React.FC<PromptRunCardProps> = ({
  activeTabId,
  run,
  stepCount,
  promptRunningStatus,
}) => {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200 bg-white',
        'px-4 py-3 text-xs text-slate-700 shadow-[0_8px_30px_-20px_rgba(15,23,42,0.35)]',
        {
          'space-y-3':
            promptRunningStatus === 'planning' ||
            promptRunningStatus === 'thinking' ||
            promptRunningStatus === 'running',
          'space-y-2':
            promptRunningStatus === 'completed' ||
            promptRunningStatus === 'error',
        },
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Agent Steps
        </div>
        <span className="text-[10px] text-slate-400">#{run.requestId}</span>
      </div>
      {stepCount > 0 ? (
        <ActionList activeTabId={activeTabId} requestId={run.requestId} />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
          Waiting for steps...
        </div>
      )}
      <div className="pt-2">
        <PromptRunStatusLabel />
      </div>
    </div>
  );
};
