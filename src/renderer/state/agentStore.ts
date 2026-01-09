/**
 * Agent Store - Re-export module
 *
 * This file re-exports from the modular agentStore directory for backwards
 * compatibility. New code should import directly from './agentStore/index'.
 *
 * @deprecated Import from './agentStore' instead of './agentStore.ts'
 */

export {
  useAgentStore,
  type Message,
  type LlmSessionSnapshot,
  type ActionItem,
  type ActionItemStatus,
  type ThinkingItem,
  type ThinkingItemKind,
  type ThinkingItemStatus,
  type PromptRunStatus,
  type PromptRunningStatus,
  type PromptRunPhase,
  type PromptRunItem,
  type PromptStepItem,
  type AgentState,
} from './agentStore/index';
