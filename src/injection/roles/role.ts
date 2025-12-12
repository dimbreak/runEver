import { Session } from './session';

export abstract class Role<R = any> {
  systemPrompt!: string;

  newSession(promptTransformer = defaultPromptTransformer): Session<R> {
    return new Session(this, promptTransformer);
  }

  abstract parseLLMResult(result: string): R;
}

const defaultPromptTransformer = (prompt: string) => `[url]
${window.location.href}

[user prompt]
${prompt}
`;
