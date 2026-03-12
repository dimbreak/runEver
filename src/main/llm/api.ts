import type { AsyncQueue } from '../../utils/asyncQueue';
import { LlmApi as AgenticLlmApi } from '../../agentic/api';

async function* queueToGenerator(
  streamPromise: Promise<AsyncQueue<string>>,
): AsyncGenerator<string, void, void> {
  const stream = await streamPromise;
  for await (const chunk of stream) {
    yield chunk ?? '';
  }
}

export namespace LlmApi {
  export const { llmConfigSchema } = AgenticLlmApi;
  export type LlmConfig = AgenticLlmApi.LlmConfig;
  export type ReasoningEffort = AgenticLlmApi.ReasoningEffort;
  export type LlmModelType = AgenticLlmApi.LlmModelType;
  export type Attachment = AgenticLlmApi.Attachment;
  export const { ErrNoConfig } = AgenticLlmApi;
  export const { addDummyReturn } = AgenticLlmApi;

  export function queryLLMApi(
    prompt: string,
    systemPrompt = '',
    attachments: Attachment[] | null = null,
    cacheKey = '',
    model: LlmModelType = 'mid',
    reasoning: ReasoningEffort = 'low',
  ): AsyncGenerator<string, void, void> {
    return queueToGenerator(
      AgenticLlmApi.queryLLMApi(
        prompt,
        systemPrompt,
        attachments,
        cacheKey,
        model,
        reasoning,
      ),
    );
  }

  export const queryLLMSession = (
    systemPrompt: string,
    cacheKeyPrefix = '',
  ) => {
    const runner = AgenticLlmApi.queryLLMSession(systemPrompt, cacheKeyPrefix);
    return (
      prompt: string,
      attachments: Attachment[] | null = null,
      model: LlmModelType = 'mid',
      reasoning: ReasoningEffort = 'low',
      overrideSystemPrompt: string | undefined = undefined,
    ) => {
      return queueToGenerator(
        runner(prompt, attachments, model, reasoning, overrideSystemPrompt),
      );
    };
  };

  export const wrapStream = async (
    stream: AsyncGenerator<string, void, void>,
  ) => {
    const result: string[] = [];
    const start = Date.now();
    let firstToken = -1;
    for await (const part of stream) {
      if (firstToken === -1) {
        firstToken = Date.now() - start;
      }
      result.push(part ?? '');
    }
    const done = Date.now() - start;
    if (result[0][0] === '{') {
      result[0] = `{ "firstToken": ${firstToken}, "done": ${done}, ${result[0].slice(1)}`;
    }
    return result.join('');
  };
}
