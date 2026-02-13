import { RiskOrComplexityLevel } from '../../agentic/execution.schema';

/**
 * Estimates the complexity level of a prompt based on its content
 *
 * Uses heuristics to determine if a prompt is low, medium, or high complexity:
 * - High: Contains keywords like "verify", "confirm", "make sure", or "[action error]"
 * - Low: Very short prompts (< 64 characters)
 * - Medium: Moderate length prompts (64-256 characters)
 * - High: Very long prompts (> 256 characters)
 *
 * @param prompt - The prompt text to analyse
 * @returns The estimated complexity/risk level ('l', 'm', or 'h')
 */
export const estimatePromptComplexity = (
  prompt: string,
): RiskOrComplexityLevel => {
  const p = prompt.toLowerCase();
  if (/verify|confirm|make sure|\[action error]/.test(p)) return 'h';
  // eslint-disable-next-line no-nested-ternary
  return p.length < 256 ? 'l' : p.length > 1024 ? 'h' : 'm';
};
