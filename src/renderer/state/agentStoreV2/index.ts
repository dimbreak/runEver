/**
 * Agent Store V2 - Exports
 *
 * Replaces the V1 agent store with a simplified architecture:
 * - Sessions own messages (not tabs)
 * - Tabs live under sessions
 * - Prompt running status is pushed as messages with taskSnapshot
 *
 * @example
 * import { useAgentStoreV2, type Message } from '@/renderer/state/agentStoreV2';
 *
 * const messages = useAgentStoreV2(
 *   (state) => state.messagesBySessionId[sessionId] ?? [],
 * );
 */

export { useAgentStoreV2 } from './store';

export type {
  Message,
  PromptRunningStatus,
  Session,
  AgentStateV2,
} from './types';
