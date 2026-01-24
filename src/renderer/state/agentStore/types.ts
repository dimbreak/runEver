/**
 * Type definitions for the agent store.
 * Contains all shared types used across the agent state management.
 */

import type { JSONContent } from '@tiptap/core';

// -----------------------------------------------------------------------------
// Message Types
// -----------------------------------------------------------------------------

/**
 * Represents a chat message in the agent conversation.
 */
export type Message = {
  id: number;
  role: 'user' | 'assistant';
  content: JSONContent;
  text?: string;
  llmResponding?: boolean;
  tag?: string;
  image?: string;
  attachments?: Array<{
    name: string;
    mimeType: string;
    size: number;
    data: ArrayBuffer;
  }>;
};

// -----------------------------------------------------------------------------
// LLM Session Types
// -----------------------------------------------------------------------------

/**
 * Snapshot of the LLM session state, synchronised from the main process.
 */
export type LlmSessionSnapshot = {
  frameId: number;
  activeRequestId: number | null;
  runQueue: number[];
  runs: Array<{
    requestId: number;
    stopRequested: boolean;
    args: Record<string, unknown>;
    actions: Array<{
      id: number;
      intent?: string;
      risk?: string;
      done?: boolean;
      error?: string[];
      stepPrompt?: string;
      promptId?: number;
      argsDelta?: Record<string, string>;
      action?: unknown;
    }>;
    currentAction: number;
    prompts: Array<{
      id: number;
      parentId?: number;
      sessionId?: number;
      goalPrompt: string;
      subPrompt?: string;
      argsAdded?: Record<string, string> | null;
      complexity?: string;
    }>;
    breakPromptForExeErr: boolean;
    fixingAction?: {
      actionId: number;
      offset: number;
      promptId: number;
    } | null;
    sessionQueue: Array<{
      id: number;
      parentId: number | null;
      promptQueue: Array<{
        id: number;
        parentId?: number;
        sessionId?: number;
        goalPrompt: string;
        subPrompt?: string;
        argsAdded?: Record<string, string> | null;
        complexity?: string;
      }>;
      subSessionQueueIds: number[];
      breakPromptForExeErr: boolean;
    }>;
    runningSessionIds: number[];
  }>;
  updatedAt: number;
};

// -----------------------------------------------------------------------------
// Action Item Types
// -----------------------------------------------------------------------------

export type ActionItemStatus = 'queued' | 'running' | 'done' | 'error';

/**
 * Represents a single action item derived from the LLM session snapshot.
 */
export type ActionItem = {
  id: number;
  requestId: number;
  promptId?: number;
  intent?: string;
  risk?: string;
  done?: boolean;
  error?: string[];
  stepPrompt?: string;
  argsDelta?: Record<string, string>;
  action?: unknown;
  prompt?: {
    id: number;
    parentId?: number;
    sessionId?: number;
    goalPrompt: string;
    subPrompt?: string;
    argsAdded?: Record<string, string> | null;
    complexity?: string;
  };
  status: ActionItemStatus;
  updatedAt: number;
};

// -----------------------------------------------------------------------------
// Thinking Item Types
// -----------------------------------------------------------------------------

export type ThinkingItemKind =
  | 'planning'
  | 'planning_output'
  | 'action_thinking'
  | 'running';

export type ThinkingItemStatus = 'running' | 'done' | 'error';

/**
 * Represents a thinking/planning phase item shown in the UI.
 */
export type ThinkingItem = {
  id: string;
  requestId: number;
  kind: ThinkingItemKind;
  status: ThinkingItemStatus;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  content?: string;
  updatedAt: number;
};

// -----------------------------------------------------------------------------
// Prompt Run Types
// -----------------------------------------------------------------------------

export type PromptRunStatus = 'planning' | 'running' | 'completed' | 'error';

export type PromptRunningStatus =
  | 'planning'
  | 'thinking'
  | 'running'
  | 'completed'
  | 'error';

export type PromptRunPhase = {
  status: 'planning' | 'running';
  startedAt: number;
  endedAt?: number;
};

/**
 * Represents a prompt run with its lifecycle phases.
 */
export type PromptRunItem = {
  requestId: number;
  userMessageId: number;
  status: PromptRunStatus;
  startedAt: number;
  completedAt?: number;
  phases: PromptRunPhase[];
};

// -----------------------------------------------------------------------------
// Prompt Step Types
// -----------------------------------------------------------------------------

/**
 * Represents a step in the prompt execution timeline.
 * Can be either a thinking step or an action step.
 */
export type PromptStepItem =
  | {
      id: string;
      kind: 'thinking';
      requestId: number;
      thinkingId: string;
      startedAt: number;
      updatedAt: number;
    }
  | {
      id: string;
      kind: 'action';
      requestId: number;
      actionId: number;
      startedAt: number;
      updatedAt: number;
    };

// -----------------------------------------------------------------------------
// Store State Type
// -----------------------------------------------------------------------------

/**
 * The complete agent store state and actions.
 */
export type AgentState = {
  // State
  messagesByTabId: Record<string, Message[]>;
  sessionByTabId: Record<string, LlmSessionSnapshot | null>;
  actionItemsByTabId: Record<string, ActionItem[]>;
  expandedActionIdsByTabId: Record<string, Record<number, boolean>>;
  thinkingItemsByTabId: Record<string, ThinkingItem[]>;
  expandedThinkingIdsByTabId: Record<string, Record<string, boolean>>;
  promptRunsByTabId: Record<string, PromptRunItem[]>;
  promptStepsByTabId: Record<string, PromptStepItem[]>;
  promptFinishedByTabId: Record<string, Record<number, boolean>>;
  promptRunningStatus: PromptRunningStatus;
  runningRequestId: number | null;

  // Actions
  ensureTab: (tabId: string) => void;
  addMessage: (tabId: string, message: Message) => void;
  updateMessage: (
    tabId: string,
    messageId: number,
    updater: (message: Message) => Message,
  ) => void;
  setMessages: (tabId: string, messages: Message[]) => void;
  setSessionSnapshot: (
    tabId: string,
    snapshot: LlmSessionSnapshot | null,
  ) => void;
  startThinking: (tabId: string, requestId: number) => void;
  appendPlanningOutput: (
    tabId: string,
    requestId: number,
    chunk: string,
  ) => void;
  finishPlanning: (tabId: string, requestId: number) => void;
  startActionThinking: (tabId: string, requestId: number) => void;
  markThinkingError: (
    tabId: string,
    requestId: number,
    errorMessage?: string,
  ) => void;
  toggleActionExpanded: (tabId: string, actionId: number) => void;
  toggleThinkingExpanded: (tabId: string, thinkingId: string) => void;
  addPromptRun: (
    tabId: string,
    requestId: number,
    userMessageId: number,
  ) => void;
  setPromptRunStatus: (
    tabId: string,
    requestId: number,
    status: PromptRunStatus,
  ) => void;
  markPromptFinished: (tabId: string, requestId: number) => void;
  setPromptRunningStatus: (status: PromptRunningStatus) => void;
  setRunningRequestId: (id: number | null) => void;
  clearTab: (tabId: string) => void;
};
