import * as React from 'react';
import { useAgentStore } from '../../state/agentStore';

export const statusStyleMap: Record<
  'planning' | 'thinking' | 'running' | 'completed' | 'error',
  { label: string; className: string; hint: string }
> = {
  planning: {
    label: 'Planning',
    className: 'bg-blue-100 text-blue-700',
    hint: 'Planning...',
  },
  thinking: {
    label: 'Thinking',
    className: 'bg-amber-100 text-amber-700',
    hint: 'Thinking the next move...',
  },
  running: {
    label: 'Running',
    className: 'bg-blue-100 text-blue-700',
    hint: 'Executing actions...',
  },
  completed: {
    label: 'Completed',
    className: 'bg-emerald-100 text-emerald-700',
    hint: 'All actions completed.',
  },
  error: {
    label: 'Error',
    className: 'bg-rose-100 text-rose-700',
    hint: 'Stopped with errors.',
  },
};

export const PromptRunStatusLabel = () => {
  const promptRunningStatus = useAgentStore(
    (state) => state.promptRunningStatus,
  );
  const style = statusStyleMap[promptRunningStatus];
  return (
    <div className="flex items-center gap-2 text-[12px] text-slate-600">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.className}`}
      >
        {style.label}
      </span>
      <span className="text-slate-500">{style.hint}</span>
    </div>
  );
};
