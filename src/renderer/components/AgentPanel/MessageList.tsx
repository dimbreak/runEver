import * as React from 'react';
import { useAgentStore } from '../../state/agentStore';
import { MessageItem } from './MessageItem';
import { ActionList } from './ActionList';

type MessageListProps = {
  activeTabId: string | null;
  isPromptRunning: boolean;
};

const statusStyleMap: Record<
  'planning' | 'planned' | 'running' | 'completed' | 'error',
  { label: string; className: string; hint: string }
> = {
  planning: {
    label: 'Planning',
    className: 'bg-blue-100 text-blue-700',
    hint: 'Working on a plan...',
  },
  planned: {
    label: 'Planned',
    className: 'bg-slate-100 text-slate-600',
    hint: 'Ready to run actions.',
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

const PromptRunStatusLabel: React.FC<{
  status: keyof typeof statusStyleMap;
  requestId: number;
}> = ({ status, requestId }) => {
  const style = statusStyleMap[status];
  return (
    <div className="flex items-center gap-2 text-[12px] text-slate-600">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.className}`}
      >
        {style.label}
      </span>
      <span className="text-slate-500">{style.hint}</span>
      <span className="text-[10px] text-slate-400">#{requestId}</span>
    </div>
  );
};

export const MessageList = React.memo(
  ({ activeTabId, isPromptRunning }: MessageListProps) => {
    const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

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
    React.useEffect(() => {
      const behavior = isPromptRunning ? 'auto' : 'smooth';
      const node = messagesEndRef.current as any;
      if (node && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ behavior, block: 'end' });
      }
    }, [
      isPromptRunning,
      messages,
      actionItems.length,
      thinkingItems.length,
      promptRuns.length,
    ]);

    return (
      <div className="flex-1 overflow-y-auto bg-slate-50/70 px-4 py-3 space-y-3">
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
                  <ActionList
                    activeTabId={activeTabId}
                    requestId={run.requestId}
                  />
                  <PromptRunStatusLabel
                    status={run.status}
                    requestId={run.requestId}
                  />
                </React.Fragment>
              ))}
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    );
  },
);
