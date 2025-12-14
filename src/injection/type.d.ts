// TODO: Restore real types from @fsb/drizzle when dependency is available.
// import {
//   type workflowTable,
//   type workflowTaskTable,
//   type TaskRunRecord,
// } from '@fsb/drizzle';

// Lightweight placeholders to keep type-checking working without @fsb/drizzle.
export type workflowTable = {
  id: string;
  name?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type workflowTaskTable = {
  id: string;
  workflowId: string;
  name?: string;
  status?: string;
  steps: { id: string; prompt: string }[];
  createdAt?: string;
  updatedAt?: string;
};

export type TaskRunRecord = {
  id: string;
  taskId: string;
  status: string;
  output?: string;
  startedAt?: string;
  finishedAt?: string;
};

declare global {
  const browser: typeof chrome;
}

export interface WorkflowRecord {
  workflow: workflowTable & {
    tasks: workflowTaskTable[];
    creator: {
      id: string;
      name: string;
      image: string;
    };
  };
  inputArgs: string;
  argWithKey?: Record<string, string>;
  context?: string;
  taskIndex?: number;
  stepIndex?: number;
  taskRecords?: TaskRunRecord[];
  origin: string;
  finishedUrl: string;
  runId: string;
  isTabActive?: boolean;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  argumentKeyAndDescription?: [string, string];
}

export type LLMApiPart = { part?: string; eof?: boolean; error?: string };
