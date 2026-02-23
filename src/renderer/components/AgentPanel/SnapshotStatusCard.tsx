import * as React from 'react';
import {
  Clock,
  Loader2,
  SkipForward,
  AlertTriangle,
  Brain,
  Square,
  SquareCheckBig,
  CircleDot,
  CircleOff,
} from 'lucide-react';
import type { Message } from '../../state/agentStoreV2';
import type {
  TaskSnapshot,
  TaskActionSnapshot,
  SubTaskSnapshot,
} from '../../../schema/taskSnapshot';
import { cn } from '../../utils/cn';

type SnapshotStatusCardProps = {
  message: Message;
};

// ---------------------------------------------------------------------------
// Status config — icon-only badge per TaskRunningStatus
// ---------------------------------------------------------------------------

const statusConfig: Record<
  string,
  {
    className: string;
    icon: React.ReactNode;
  }
> = {
  Pending: {
    className: 'text-slate-500',
    icon: <Clock className="h-4 w-4" />,
  },
  Thinking: {
    className: 'text-amber-500',
    icon: <Brain className="animate-heartbeat h-4 w-4" />,
  },
  Executing: {
    className: 'text-blue-500',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
  },
  Finished: {
    className: 'text-emerald-500',
    icon: <SquareCheckBig className="h-4 w-4" />,
  },
  Canceled: {
    className: 'text-rose-500',
    icon: <CircleOff className="h-4 w-4" />,
  },
};

// ---------------------------------------------------------------------------
// Action status icon — WireActionStatus enum: 0=pending 1=done 2=working 3=skipped
// All square-contained except the executing spinner (Loader2)
// ---------------------------------------------------------------------------

const ActionStatusIcon: React.FC<{ status: number }> = ({ status }) => {
  switch (status) {
    case 1: // done
      return <SquareCheckBig className="h-4 w-4 text-emerald-500" />;
    case 2: // working
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 3: // skipped
      return <SkipForward className="h-4 w-4 text-slate-400" />;
    default: // pending (0)
      return <Square className="h-4 w-4 text-slate-300" />;
  }
};

// ---------------------------------------------------------------------------
// Checkpoint status icon — ExeTaskStatus: 0=Todo 1=Working 2=Verified 3=Cancel 4=Abnormal
// All square-contained except the working spinner (Loader2)
// ---------------------------------------------------------------------------

const CheckpointIcon: React.FC<{ status: number }> = ({ status }) => {
  switch (status) {
    case 2: // Verified
      return <SquareCheckBig className="h-4 w-4 text-emerald-500" />;
    case 1: // Working
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 3: // Cancel
      return <SkipForward className="h-4 w-4 text-slate-400" />;
    case 4: // Abnormal
      return <AlertTriangle className="h-4 w-4 text-rose-500" />;
    default: // Todo (0)
      return <Square className="h-4 w-4 text-slate-300" />;
  }
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ActionRow: React.FC<{ action: TaskActionSnapshot; index: number }> = ({
  action,
  index,
}) => (
  <div className="flex items-start gap-2 text-[13px] leading-5 text-slate-600">
    <span className="mt-0.5 shrink-0">
      <ActionStatusIcon status={action.status as number} />
    </span>
    <span>{action.intent || `Action ${index + 1}`}</span>
    {action.errors && action.errors.length > 0 && (
      <span className="flex shrink-0 items-start gap-1 text-rose-500">
        <AlertTriangle className="mt-0.5 h-4 w-4" />
        <span>{action.errors[0]}</span>
      </span>
    )}
  </div>
);

/**
 * Renders a subtask (no actions). Shows its own checklist with nested subtasks
 * bound to each checkpoint recursively.
 */
const SubTaskSummary: React.FC<{ snapshot: SubTaskSnapshot }> = ({
  snapshot,
}) => {
  return (
    <div className="space-y-1">
      {/* Subtask's own checklist (with nested subtasks inline) */}
      {snapshot.checklist.length > 0 && (
        <ChecklistWithSubTasks
          checklist={snapshot.checklist}
          subTasksByCheckPointId={snapshot.subTasksByCheckPointId}
        />
      )}
    </div>
  );
};

/**
 * Renders a checklist, and for each checkpoint that has a bound subtask,
 * renders that subtask inline (indented) underneath.
 */
const ChecklistWithSubTasks: React.FC<{
  checklist: TaskSnapshot['checklist'];
  subTasksByCheckPointId: Record<number, SubTaskSnapshot>;
}> = ({ checklist, subTasksByCheckPointId }) => (
  <div className="space-y-1">
    {checklist.map((cp, idx) => {
      const boundSubTask = subTasksByCheckPointId[idx];
      return (
        // eslint-disable-next-line react/no-array-index-key
        <div key={`cp-${cp.checkPoint}-${idx}`}>
          {/* Checkpoint row */}
          <div className="flex items-start gap-2 text-[13px] leading-5 text-slate-600">
            <span className="mt-0.5 shrink-0">
              <CheckpointIcon status={cp.status} />
            </span>
            <span>{cp.checkPoint}</span>
          </div>
          {/* If a subtask is bound to this checkpoint, show it indented */}
          {boundSubTask && (
            <div className="mt-1 mb-1 border-l-2 border-slate-100 pl-3">
              <SubTaskSummary snapshot={boundSubTask} />
            </div>
          )}
        </div>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Renders a task snapshot that was pushed as a message.
 * Only the root task shows Actions. Subtasks are rendered inline under their
 * bound checklist points.
 */
export const SnapshotStatusCard: React.FC<SnapshotStatusCardProps> = ({
  message,
}) => {
  const [showAllActions, setShowAllActions] = React.useState(false);

  const snapshot = message.taskSnapshot;
  if (!snapshot) {
    return (
      <div className="mr-8 ml-4 flex items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        Waiting for snapshot...
      </div>
    );
  }

  const cfg = statusConfig[snapshot.status] ?? statusConfig.Pending;
  const isActive =
    snapshot.status === 'Thinking' || snapshot.status === 'Executing';

  let actionsToShow = snapshot.actions;
  const hasMoreActions = actionsToShow.length > 10;
  if (!showAllActions && hasMoreActions) {
    actionsToShow = actionsToShow.slice(-10);
  }

  return (
    <div
      className={cn(
        'mr-8 ml-4 rounded-2xl border border-slate-200 bg-white',
        'space-y-2 px-4 py-3 text-xs text-slate-700 shadow-[0_8px_30px_-20px_rgba(15,23,42,0.35)]',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div
          className={cn(
            'flex max-w-[70%] items-start gap-1.5 text-[13px] font-semibold text-slate-700',
            { 'animate-pulse': isActive },
          )}
        >
          {isActive && (
            <CircleDot className="mt-0.5 h-4 w-4 shrink-0 animate-ping text-blue-400" />
          )}
          <span>{snapshot.intent || 'Task'}</span>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-md p-1',
            cfg.className,
          )}
        >
          {cfg.icon}
        </span>
      </div>

      {/* Checklist (with bound subtasks inline) */}
      {snapshot.checklist.length > 0 && (
        <div className="space-y-1">
          <div className="text-[13px] font-semibold tracking-wide text-slate-500 uppercase">
            Checklist
          </div>
          <ChecklistWithSubTasks
            checklist={snapshot.checklist}
            subTasksByCheckPointId={snapshot.subTasksByCheckPointId}
          />
        </div>
      )}

      {/* Actions (only on root task) */}
      {snapshot.actions.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold tracking-wide text-slate-500 uppercase">
              Actions
            </div>
            {hasMoreActions && !showAllActions && (
              <button
                type="button"
                onClick={() => setShowAllActions(true)}
                className="cursor-pointer text-xs text-blue-500 transition-colors hover:text-blue-600"
                title="Show previous actions"
              >
                + {snapshot.actions.length - 10} earlier
              </button>
            )}
          </div>
          {actionsToShow.map((action, idx) => {
            const originalIndex = showAllActions
              ? idx
              : snapshot.actions.length - actionsToShow.length + idx;
            return (
              <ActionRow
                key={`action-${action.id}`}
                action={action}
                index={originalIndex}
              />
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
        <span>id: {message.id}</span>
      </div>
    </div>
  );
};
