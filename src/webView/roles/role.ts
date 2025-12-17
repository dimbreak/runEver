import { LlmSession } from './llmSession';

export abstract class Role<R = any> {
  systemPrompt!: string;

  newSession(promptTransformer = defaultPromptTransformer): LlmSession<R> {
    return new LlmSession(this, promptTransformer);
  }

  abstract parseLLMResult(result: string): R;
}

const defaultPromptTransformer = (prompt: string) => prompt;
