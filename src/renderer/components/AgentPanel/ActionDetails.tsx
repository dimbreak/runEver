import * as React from 'react';
import type { ActionItem } from '../../state/agentStore';

type ActionDetailsProps = {
  item: ActionItem;
};

export const ActionDetails: React.FC<ActionDetailsProps> = ({ item }) => {
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
