import * as React from 'react';
import { useAgentStore } from '../../state/agentStore';
import { ActionItemRow } from './ActionItemRow';
import { ThinkingItemRow } from './ThinkingItemRow';

type ActionListProps = {
  activeTabId: string | null;
  requestId: number;
};

export const ActionList: React.FC<ActionListProps> = ({
  activeTabId,
  requestId,
}) => {
  const promptSteps = useAgentStore((state) =>
    activeTabId ? (state.promptStepsByTabId[activeTabId] ?? []) : [],
  );
  const stepsForRequest = React.useMemo(
    () => promptSteps.filter((step) => step.requestId === requestId),
    [promptSteps, requestId],
  );
  const actionItems = useAgentStore((state) =>
    activeTabId
      ? (state.actionItemsByTabId[activeTabId] ?? []).filter(
          (item) => item.requestId === requestId,
        )
      : [],
  );
  const thinkingItems = useAgentStore((state) =>
    activeTabId
      ? (state.thinkingItemsByTabId[activeTabId] ?? []).filter(
          (item) => item.requestId === requestId,
        )
      : [],
  );
  const planningOutput = React.useMemo(
    () =>
      [...thinkingItems]
        .reverse()
        .find((item) => item.kind === 'planning_output')?.content ?? '',
    [thinkingItems],
  );
  const actionMap = React.useMemo(() => {
    const map = new Map<number, (typeof actionItems)[number]>();
    actionItems.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [actionItems]);
  const thinkingMap = React.useMemo(() => {
    const map = new Map<string, (typeof thinkingItems)[number]>();
    thinkingItems.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [thinkingItems]);
  const expandedActionMap = useAgentStore((state) =>
    activeTabId ? (state.expandedActionIdsByTabId[activeTabId] ?? {}) : {},
  );
  const expandedThinkingMap = useAgentStore((state) =>
    activeTabId ? (state.expandedThinkingIdsByTabId[activeTabId] ?? {}) : {},
  );
  const toggleActionExpanded = useAgentStore(
    (state) => state.toggleActionExpanded,
  );
  const toggleThinkingExpanded = useAgentStore(
    (state) => state.toggleThinkingExpanded,
  );

  if (!stepsForRequest.length) {
    return null;
  }

  return (
    <div className="space-y-2 text-xs text-slate-700">
      {stepsForRequest.map((step) => {
        if (step.kind === 'thinking') {
          const item = thinkingMap.get(step.thinkingId);
          if (!item || item.kind === 'planning_output') return null;
          const expanded = Boolean(expandedThinkingMap?.[item.id]);
          return (
            <ThinkingItemRow
              key={step.id}
              item={item}
              outputContent={planningOutput}
              expanded={expanded}
              onToggle={() => {
                if (!activeTabId) return;
                toggleThinkingExpanded(activeTabId, item.id);
              }}
            />
          );
        }
        const actionItem = actionMap.get(step.actionId);
        if (!actionItem) return null;
        const expanded = Boolean(expandedActionMap?.[actionItem.id]);
        return (
          <ActionItemRow
            key={step.id}
            item={actionItem}
            expanded={expanded}
            onToggle={() => {
              if (!activeTabId) return;
              toggleActionExpanded(activeTabId, actionItem.id);
            }}
          />
        );
      })}
    </div>
  );
};
