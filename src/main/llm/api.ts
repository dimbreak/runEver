import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { LanguageModelV2 } from '@ai-sdk/provider';
import settings from 'electron-settings';

export namespace LlmApi {
  export type LlmConfig = { error?: string; api: 'openai'; key: string };
  export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
  export type LlmModelType = 'hi' | 'mid' | 'low';

  export const ErrNoConfig = { error: 'No LLM config' } as const;

  const getLlmConfig = async () => {
    const loadedConfig = settings.getSync('llmConfig');
    if (loadedConfig) {
      return loadedConfig as LlmConfig;
    }
    const llmConfig: LlmConfig = {
      api: process.env.LLM_API_PROVIDER as 'openai',
      key: process.env.LLM_API_KEY as string,
    };

    settings.setSync('llmConfig', llmConfig);
    return llmConfig;
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

  export async function* queryLLMApi(
    prompt: string,
    systemPrompt = '',
    cacheKey = '',
    model: LlmModelType = 'mid',
    reasoning: ReasoningEffort = 'low',
  ): AsyncGenerator<string, void, void> {
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
      throw ErrNoConfig;
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

  export const wrapStream = async (
    stream: AsyncGenerator<string, any, void>,
  ) => {
    const result: string[] = [];
    for await (const part of stream) {
      result.push(part);
    }
    return result.join('');
  };
}
