import * as React from 'react';
import type { LlmSessionSnapshot } from '../../state/agentStore';

type SessionSnapshotPanelProps = {
  snapshot: LlmSessionSnapshot;
};

export const SessionSnapshotPanel: React.FC<SessionSnapshotPanelProps> = ({
  snapshot,
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-700 shadow-[0_8px_30px_-20px_rgba(15,23,42,0.35)]">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        LLM Session Snapshot
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-700">
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </div>
  );
};
