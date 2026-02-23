/**
 * Type definitions for agent store V2.
 *
 * Key architectural changes from V1:
 * - Sessions are the top-level entity; tabs live under sessions
 * - Messages belong to sessions, not tabs
 * - Switching tabs within a session does NOT clear messages
 * - Switching sessions DOES refresh the dialog
 * - Prompt running status is pushed as a message with taskSnapshot field
 *   and updated by matching id vs responseId
 */

import type { JSONContent } from '@tiptap/core';
import type { TaskSnapshot } from '../../../schema/taskSnapshot';
import type { TabStatus } from '../../../agentic/session';

// -----------------------------------------------------------------------------
// Message Types
// -----------------------------------------------------------------------------

/**
 * A chat message in a session conversation.
 *
 * When `taskSnapshot` is present the message represents a running prompt
 * status card. The snapshot is pushed as a new message and later updated
 * in-place by matching `id` against an incoming `responseId`.
 */
export type Message = {
  id: number;
  role: 'user' | 'assistant';
  content: JSONContent;
  text?: string;
  /** When true the LLM is still streaming a response. */
  llmResponding?: boolean;
  tag?: string;
  image?: string;
  /** If present this message is a live prompt-run status card. */
  taskSnapshot?: TaskSnapshot | null;
  attachments?: Array<{
    name: string;
    mimeType: string;
    size: number;
    data: ArrayBuffer;
  }>;
};

// -----------------------------------------------------------------------------
// Prompt Running Status
// -----------------------------------------------------------------------------

export type PromptRunningStatus =
  | 'idle'
  | 'planning'
  | 'thinking'
  | 'running'
  | 'completed'
  | 'error';

// -----------------------------------------------------------------------------
// Session
// -----------------------------------------------------------------------------

/**
 * A session groups a set of tabs together and owns the message history.
 * Switching between tabs inside the same session keeps the messages.
 * Switching to a different session loads that session's messages instead.
 */
export type Session = {
  id: number;
  label: string;
  /** Ordered list of tab IDs that belong to this session. */
  tabIds: number[];
  /** Currently active tab within this session. */
  activeTabId: number | null;
  /** Complete list of tab statuses that belong to this session. */
  tabs: TabStatus[];
};

// -----------------------------------------------------------------------------
// Store State
// -----------------------------------------------------------------------------

export type AgentStateV2 = {
  // ---- Session state ----
  sessions: Record<number, Session>;
  activeSessionId: number | null;

  // ---- Messages (keyed by session id) ----
  messagesBySessionId: Record<number, Message[]>;

  // ---- Prompt status (per session) ----
  promptRunningStatusBySessionId: Record<number, PromptRunningStatus>;
  runningRequestIdBySessionId: Record<number, number | null>;

  // ---- Session actions ----
  createSession: (id: number, label: string) => void;
  switchSession: (sessionId: number) => void;
  removeSession: (sessionId: number) => void;

  // ---- Tab-under-session actions ----
  addTabToSession: (sessionId: number, tabId: number) => void;
  removeTabFromSession: (sessionId: number, tabId: number) => void;
  syncTabsToSession: (sessionId: number, tabs: TabStatus[]) => void;
  switchTab: (sessionId: number, tabId: number) => void;

  // ---- Ensure helpers ----
  ensureSession: (sessionId: number) => void;

  // ---- Message actions (operate on session, not tab) ----
  addMessage: (sessionId: number, message: Message) => void;
  /**
   * Update a message in-place by its id.
   * Used when an incoming snapshot has a responseId matching an existing message.
   */
  updateMessage: (
    sessionId: number,
    messageId: number,
    updater: (message: Message) => Message,
  ) => void;
  /**
   * Add-or-update: if a message with the given id exists, update it;
   * otherwise push a new message. This is the primary entry point for
   * incoming snapshot messages.
   */
  upsertMessage: (
    sessionId: number,
    message: Message,
    isSnapshotAndRunning?: boolean,
  ) => void;
  setMessages: (sessionId: number, messages: Message[]) => void;
  clearMessages: (sessionId: number) => void;

  // ---- Prompt status actions ----
  setPromptRunningStatus: (
    sessionId: number,
    status: PromptRunningStatus,
  ) => void;
  setRunningRequestId: (sessionId: number, id: number | null) => void;
};
