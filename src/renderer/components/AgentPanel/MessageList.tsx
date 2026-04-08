import * as React from 'react';
import { useAgentStoreV2 } from '../../state/agentStoreV2';
import { MessageItem } from './MessageItem';
import { SnapshotStatusCard } from './SnapshotStatusCard';

type MessageListProps = {
  activeSessionId: number | null;
};

export const MessageList = React.memo(
  ({ activeSessionId }: MessageListProps) => {
    const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

    const promptRunningStatus = useAgentStoreV2((state) =>
      activeSessionId === null
        ? 'idle'
        : (state.promptRunningStatusBySessionId[activeSessionId] ?? 'idle'),
    );

    const messages = useAgentStoreV2((state) =>
      activeSessionId === null
        ? []
        : (state.messagesBySessionId[activeSessionId] ?? []),
    );

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
    }, [promptRunningStatus, messages]);

    console.log('messages', activeSessionId, messages);

    return (
      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.map((msg) => {
          // Messages with a taskSnapshot are prompt-run status cards
          if (msg.taskSnapshot !== undefined) {
            return <SnapshotStatusCard key={msg.id} message={msg} />;
          }
          return <MessageItem key={msg.id} message={msg} />;
        })}
        <div ref={messagesEndRef} />
      </div>
    );
  },
);
