import * as React from 'react';
import { useAgentStore } from '../../state/agentStore';
import { MessageItem } from './MessageItem';
import { SessionSnapshotPanel } from './SessionSnapshotPanel';

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
    const sessionSnapshot = useAgentStore((state) =>
      activeTabId ? (state.sessionByTabId[activeTabId] ?? null) : null,
    );

    // Auto-scroll to bottom when messages change or prompt is running
    React.useEffect(() => {
      const behavior = isPromptRunning ? 'auto' : 'smooth';
      const node = messagesEndRef.current as any;
      if (node && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ behavior, block: 'end' });
      }
    }, [isPromptRunning, messages]);

    return (
      <div className="flex-1 overflow-y-auto bg-slate-50/70 px-4 py-3 space-y-3">
        {sessionSnapshot && <SessionSnapshotPanel snapshot={sessionSnapshot} />}
        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>
    );
  },
);
