import { RiskOrComplexityLevel, WireActionWithWait } from './execution.schema';

/**
 * Extended wire action type with additional tracking properties
 * for execution state management
 */
export type WireActionWithWaitAndRec = WireActionWithWait & {
  done?: boolean;
  error?: string[];
  stepPrompt?: string;
  promptId?: number;
  argsDelta?: Record<string, string>;
  id: number;
};

/**
 * Represents a single prompt in the execution queue
 */
export type Prompt = {
  id: number;
  parentId?: number;
  sessionId?: number;
  goalPrompt: string;
  subPrompt?: string;
  argsAdded?: Record<string, string> | null;
  complexity?: RiskOrComplexityLevel;
  attachments?: string[];
  subtaskResp?: string;
};
