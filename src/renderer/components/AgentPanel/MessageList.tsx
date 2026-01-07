import * as React from 'react';
import { useAgentStore } from '../../state/agentStore';
import { MessageItem } from './MessageItem';
import { ActionList } from './ActionList';

type MessageListProps = {
  activeTabId: string | null;
  isPromptRunning: boolean;
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
    // Auto-scroll to bottom when messages change or prompt is running
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
                <ActionList
                  key={`${msg.id}-${run.requestId}`}
                  activeTabId={activeTabId}
                  requestId={run.requestId}
                  status={run.status}
                />
              ))}
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    );
  },
);
