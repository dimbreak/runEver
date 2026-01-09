import * as React from 'react';
import { useAgentStore } from '../../state/agentStore';
import { MessageItem } from './MessageItem';
import { ActionList } from './ActionList';
import { PromptRunStatusLabel } from './PromptRunStatus';
import { cn } from '../../utils/cn';

type MessageListProps = {
  activeTabId: string | null;
};

export const MessageList = React.memo(({ activeTabId }: MessageListProps) => {
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const promptRunningStatus = useAgentStore(
    (state) => state.promptRunningStatus,
  );

  // Select messages and session snapshot for the active tab
  const messages = useAgentStore((state) =>
    activeTabId ? (state.messagesByTabId[activeTabId] ?? []) : [],
  );
  const promptRuns = useAgentStore((state) =>
    activeTabId ? (state.promptRunsByTabId[activeTabId] ?? []) : [],
  );
  const actionItems = useAgentStore((state) =>
    activeTabId ? (state.actionItemsByTabId[activeTabId] ?? []) : [],
  );
  const thinkingItems = useAgentStore((state) =>
    activeTabId ? (state.thinkingItemsByTabId[activeTabId] ?? []) : [],
  );
  const actionCountsByRequestId = React.useMemo(() => {
    const map = new Map<number, number>();
    actionItems.forEach((item) => {
      map.set(item.requestId, (map.get(item.requestId) ?? 0) + 1);
    });
    return map;
  }, [actionItems]);
  const thinkingCountsByRequestId = React.useMemo(() => {
    const map = new Map<number, number>();
    thinkingItems.forEach((item) => {
      if (item.kind === 'planning_output') return;
      map.set(item.requestId, (map.get(item.requestId) ?? 0) + 1);
    });
    return map;
  }, [thinkingItems]);
  React.useEffect(() => {
    const behavior =
      promptRunningStatus === 'planning' ||
      promptRunningStatus === 'thinking' ||
      promptRunningStatus === 'running'
        ? 'auto'
        : 'smooth';
    const node = messagesEndRef.current as any;
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior, block: 'end' });
    }
  }, [
    promptRunningStatus,
    messages,
    actionItems.length,
    thinkingItems.length,
    promptRuns.length,
  ]);

  return (
    <div className="flex-1 overflow-y-auto space-y-3">
      {messages.map((msg) => {
        const runsForMessage =
          msg.role === 'user'
            ? promptRuns.filter((run) => run.userMessageId === msg.id)
            : [];
        return (
          <React.Fragment key={msg.id}>
            <MessageItem message={msg} />
            {runsForMessage.map((run) => (
              <React.Fragment key={`${msg.id}-${run.requestId}`}>
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
                    <span className="text-[10px] text-slate-400">
                      #{run.requestId}
                    </span>
                  </div>
                  {(actionCountsByRequestId.get(run.requestId) ?? 0) +
                    (thinkingCountsByRequestId.get(run.requestId) ?? 0) >
                  0 ? (
                    <ActionList
                      activeTabId={activeTabId}
                      requestId={run.requestId}
                    />
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
                      Waiting for steps...
                    </div>
                  )}
                  <div className="pt-2">
                    <PromptRunStatusLabel />
                  </div>
                </div>
              </React.Fragment>
            ))}
          </React.Fragment>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
});
