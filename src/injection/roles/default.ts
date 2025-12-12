import { Receptionist } from './system/receptionist';
import { Planner } from './system/planner';
import { Executor } from './system/executor';
import { Auditor } from './system/auditor';
import { TaskBuilder } from './system/taskBuilder';

export const defaultReceptionist = new Receptionist();
export const defaultPlanner = new Planner();
export const defaultExecutor = new Executor();
export const defaultAuditor = new Auditor();
export const defaultTaskBuilder = new TaskBuilder();
