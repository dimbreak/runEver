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

export type ToBackgroundMsg =
  | ({ type: 'INIT_WORKFLOW' } & WorkflowRecord)
  | ({ type: 'WORKFLOW_UPDATED' } & Partial<WorkflowRecord>)
  | { type: 'CHECK_WORKFLOW' }
  | { type: 'SUB_NETWORK_STATUS' }
  | { type: 'UNSUB_NETWORK_STATUS' }
  | { type: 'SAVE_LLM_KEY'; key: string }
  | { type: 'GET_LLM_KEY' }
  | {
      type: 'CALL_LLM';
      prompt: string;
      systemPrompt: string;
      reasoning: 'minimal' | 'low' | 'medium' | 'high';
      cacheKey?: string;
    };

export type LLMApiPart = { part?: string; eof?: boolean; error?: string };

export type LLMApiRunner = (
  prompt: string,
  systemPrompt?: string,
  cacheKey?: string,
  reasoning?: Extract<ToBackgroundMsg, { type: 'CALL_LLM' }>['systemPrompt'],
) => AsyncGenerator<LLMApiPart, 'NO_RETRY: no key' | undefined, void>;

export type WorkflowExecutor = (rec: WorkflowRecord) => Promise<void>;
