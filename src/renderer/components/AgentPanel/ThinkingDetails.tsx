import * as React from 'react';
import type { ThinkingItem } from '../../state/agentStore';

type ThinkingDetailsProps = {
  item: ThinkingItem;
  outputContent?: string;
};

export const ThinkingDetails: React.FC<ThinkingDetailsProps> = ({
  item,
  outputContent,
}) => {
  if (item.status === 'running') return null;
  const detailsContent =
    item.content ?? (item.kind === 'planning' ? outputContent : undefined);
  if (!detailsContent?.trim()) return null;
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-700">
        {detailsContent}
      </pre>
    </div>
  );
};
