/**
 * Agent Store - Exports
 *
 * This module provides state management for the agent panel, including:
 * - Chat messages
 * - LLM session state
 * - Action and thinking items
 * - Prompt runs and steps
 *
 * @example
 * import { useAgentStore, type Message } from '@/renderer/state/agentStore';
 *
 * const messages = useAgentStore((state) => state.messagesByTabId[tabId]);
 */

// Re-export the store
export { useAgentStore } from './store';

// Re-export all types
export type {
  Message,
  LlmSessionSnapshot,
  ActionItem,
  ActionItemStatus,
  ThinkingItem,
  ThinkingItemKind,
  ThinkingItemStatus,
  PromptRunStatus,
  PromptRunningStatus,
  PromptRunPhase,
  PromptRunItem,
  PromptStepItem,
  AgentState,
} from './types';
