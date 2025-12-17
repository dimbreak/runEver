import { createOpenAI } from '@ai-sdk/openai';
import z from 'zod';
import { streamText } from 'ai';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { ExecutorLlmResultSchema } from './roles/system/executor.schema';
import { ToMainIpc } from '../contracts/toMain';

const getLlmConfig = async () => {
  return ToMainIpc.getLlmConfig.invoke(window.frameId ?? 0);
};

let llmApiPromise: Promise<{
  hi: LanguageModelV2;
  mid: LanguageModelV2;
  low: LanguageModelV2;
} | null>;
const getLlmApi = async (): Promise<{
  hi: LanguageModelV2;
  mid: LanguageModelV2;
  low: LanguageModelV2;
} | null> => {
  if (!llmApiPromise) {
    llmApiPromise = new Promise(async (resolve) => {
      const apiConfig = await getLlmConfig();
      console.log('apiConfig', apiConfig);
      if (apiConfig.error) {
        console.error('Failed to get LLM config', apiConfig.error);
        return null;
      }
      switch (apiConfig.api) {
        case 'openai': {
          const openai = createOpenAI({ apiKey: apiConfig.key });
          resolve({
            hi: openai('gpt-5.2'),
            mid: openai('gpt-5-mini'),
            low: openai('gpt-5-nano'),
          });
          break;
        }
        default:
          throw new Error(`Unsupported LLM API: ${apiConfig.api}`);
      }
    });
  }
  return llmApiPromise;
};

const queryLLMApiResultSchema = ExecutorLlmResultSchema;
type queryLLMApiResult =
  | z.infer<typeof queryLLMApiResultSchema>
  | 'NO_RETRY: no key'
  | 'NO_RETRY: call error';

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
export type LlmModelType = 'hi' | 'mid' | 'low';

export async function* queryLLMApi(
  prompt: string,
  systemPrompt = '',
  cacheKey = '',
  model: LlmModelType = 'mid',
  reasoning: ReasoningEffort = 'low',
): AsyncGenerator<string, 'NO_RETRY: no key' | undefined, void> {
  const llmApi = await getLlmApi();
  if (llmApi) {
    const start = Date.now();
    const { textStream, request } = streamText({
      model: llmApi[model],
      providerOptions: {
        openai: {
          reasoningEffort: reasoning,
          promptCacheKey: cacheKey ?? undefined,
        },
      },
      prompt: systemPrompt
        ? [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: prompt,
            },
          ]
        : prompt,
    });
    for await (const part of textStream) {
      console.log('Stream', Date.now() - start, part);
      yield part;
    }
  } else {
    return 'NO_RETRY: no key';
  }
}

export const queryLLMSession = (systemPrompt: string) => {
  const cacheKey = `${Math.round(Math.random() * 1000000)}`;
  return (
    prompt: string,
    model: 'hi' | 'mid' | 'low' = 'mid',
    reasoning: 'minimal' | 'low' | 'medium' | 'high' = 'low',
  ) => {
    return queryLLMApi(prompt, systemPrompt, cacheKey, model, reasoning);
  };
};
