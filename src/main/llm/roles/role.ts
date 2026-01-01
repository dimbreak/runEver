import { LlmSession } from './llmSession';

export abstract class Role<R = any> {
  systemPrompt!: string;

  // deprecated
  newSession(promptTransformer = defaultPromptTransformer): LlmSession {
    return new LlmSession('');
  }

  abstract parseLLMResult(result: string): R;
}

const defaultPromptTransformer = (prompt: string) => prompt;
