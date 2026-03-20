/**
 * Shared snapshot types for task execution state.
 * Safe to import from both main process and renderer.
 */
import { RiskOrComplexityLevel } from '../agentic/execution.schema';

export type TaskRunningStatus =
  | 'Pending'
  | 'Thinking'
  | 'Executing'
  | 'Finished'
  | 'Canceled';

export enum ExeTaskStatus {
  Todo = 0,
  Working = 1,
  Verified = 2,
  Cancel = 3,
  Abnormal = 4,
}

export interface ExeTaskCheckPoint {
  checkPoint: string;
  status: ExeTaskStatus;
  comment?: string;
  skills?: string[];
}

export type TaskActionSnapshot = {
  id: number;
  intent: string;
  risk: RiskOrComplexityLevel;
  status: WireActionStatus;
  checkPoints: number[];
  errors?: string[];
};

export type SubTaskSnapshot = Omit<TaskSnapshot, 'actions'>;

export type TaskSnapshot = {
  intent: string;
  status: TaskRunningStatus;
  actions: TaskActionSnapshot[];
  checklist: ExeTaskCheckPoint[];
  /** Maps checklist point index → subtask. Only root task has actions. */
  subTasksByCheckPointId: Record<number, SubTaskSnapshot>;
};

export enum WireActionStatus {
  'pending',
  'done',
  'working',
  'skipped',
}
