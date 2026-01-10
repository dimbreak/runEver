import * as React from 'react';
import { useAgentStore } from '../../state/agentStore';
import { MessageItem } from './MessageItem';
import { PromptRunCard } from './PromptRunCard';

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
  const promptSteps = useAgentStore((state) =>
    activeTabId ? (state.promptStepsByTabId[activeTabId] ?? []) : [],
  );
  const stepCountsByRequestId = React.useMemo(() => {
    const map = new Map<number, number>();
    promptSteps.forEach((item) => {
      map.set(item.requestId, (map.get(item.requestId) ?? 0) + 1);
    });
    return map;
  }, [promptSteps]);
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
  }, [promptRunningStatus, messages, promptSteps.length, promptRuns.length]);

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
              <PromptRunCard
                key={`${msg.id}-${run.requestId}`}
                activeTabId={activeTabId}
                run={run}
                stepCount={stepCountsByRequestId.get(run.requestId) ?? 0}
                promptRunningStatus={promptRunningStatus}
              />
            ))}
          </React.Fragment>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
});
