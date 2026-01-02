import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModelV2 } from '@ai-sdk/provider';
import type { FilePart, ImagePart } from '@ai-sdk/provider-utils';
import { streamText } from 'ai';
import settings from 'electron-settings';
import z from 'zod';
import { envSchema, envVars } from '../schema/env';
import { Util } from '../webView/util';

export namespace LlmApi {
  export const llmConfigSchema = z.object({
    api: envSchema.shape.provider,
    key: envSchema.shape.apiKey,
    error: z.string().optional(),
  });
  export type LlmConfig = z.infer<typeof llmConfigSchema>;
  export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
  export type LlmModelType = 'hi' | 'mid' | 'low';
  export type Attachment = ImagePart | FilePart;

  export const ErrNoConfig = { error: 'No LLM config' } as const;

  const getLlmConfig = async () => {
    const loadedConfig = settings.getSync('llmConfig');
    try {
      return llmConfigSchema.parse(loadedConfig) as LlmConfig;
    } catch (error) {
      const llmConfig: LlmConfig = {
        api: envVars.provider,
        key: envVars.apiKey,
        error: error instanceof Error ? error.message : undefined,
      };
      settings.setSync('llmConfig', llmConfig);
      return llmConfig;
    }
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
        console.info('apiConfig:', apiConfig);
        console.log('apiConfig', apiConfig);
        if (apiConfig.error) {
          console.error('Failed to get LLM config', apiConfig.error);
          return null;
        }
        switch (apiConfig.api) {
          case 'openai': {
            console.info('createOpenAI', apiConfig.key);
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

  const dummyReturns: string[] = [];
  let streamQueryer = streamText;

  const streamDummy: any = (
    ...arg: typeof streamText extends (...v: infer T) => any ? T : never
  ) => {
    const res = dummyReturns.shift();
    if (dummyReturns.length === 0) {
      streamQueryer = streamText;
    }
    return {
      request: arg[0],
      textStream: (async function* () {
        let remain = res!;
        let end = 0;
        while (remain.length) {
          end = Math.min(remain.length, Math.floor(Math.random() * 5 + 1));
          yield remain.slice(0, end);
          remain = remain.slice(end);
          await Util.sleep(Math.random() * 100);
        }
      })(),
    } as any as ReturnType<typeof streamText>;
  };

  export const addDummyReturn = (text: string) => {
    dummyReturns.push(text);
    streamQueryer = streamDummy;
  };

  export async function* queryLLMApi(
    prompt: string,
    systemPrompt = '',
    attachments: Attachment[] | null = null,
    cacheKey = '',
    model: LlmModelType = 'mid',
    reasoning: ReasoningEffort = 'low',
  ): AsyncGenerator<string, void, void> {
    const llmApi = await getLlmApi();
    console.info('llmApi:', llmApi);
    if (llmApi) {
      const start = Date.now();
      // console.log('Query LLM', prompt);
      // throw new Error('Not implemented');
      const { textStream } = streamQueryer({
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
                content: attachments
                  ? [
                      {
                        type: 'text',
                        text: prompt,
                      },
                      ...attachments,
                    ]
                  : prompt,
              },
            ]
          : prompt,
      });
      let first = true;
      const interval = setInterval(() => {
        console.log(
          'Waiting for first token',
          cacheKey,
          Date.now() - start,
          first,
        );
      }, 3000);
      for await (const part of textStream) {
        if (first) {
          clearInterval(interval);
          console.log('Stream first token', cacheKey, Date.now() - start, part);
          first = false;
        }
        yield part;
      }
    } else {
      throw ErrNoConfig;
    }
  }

  export const queryLLMSession = (
    systemPrompt: string,
    cacheKeyPrefix = '',
  ) => {
    const cacheKey = `${cacheKeyPrefix}${Math.round(Math.random() * 1000000)}`;
    return (
      prompt: string,
      attachments: Attachment[] | null = null,
      model: LlmModelType = 'mid',
      reasoning: ReasoningEffort = 'low',
    ) => {
      return queryLLMApi(
        prompt,
        systemPrompt,
        attachments,
        cacheKey,
        model,
        reasoning,
      );
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
