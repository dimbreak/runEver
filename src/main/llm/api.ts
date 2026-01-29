import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModelV2 } from '@ai-sdk/provider';
import type { FilePart, ImagePart } from '@ai-sdk/provider-utils';
import { streamText } from 'ai';
import z from 'zod';
import { envSchema } from '../../schema/env.schema';
import { apiTrustEnvVars } from '../../schema/env.node';
import { Util } from '../../webView/util';
import { ApiTrustTokenStore } from '../apiTrustTokenStore';
import { UserApiKeyStore } from '../userApiKeyStore';
import { getAuthMode } from '../authModeStore';
import { getApiTrustStream } from '../../shared/aiGateway';

const getApiTrustErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : '';
};

const isApiTrustAuthError = (error: unknown) => {
  const message = getApiTrustErrorMessage(error).toLowerCase();
  return (
    message.includes('unauthorized') ||
    message.includes('invalid access token') ||
    message.includes('access token expired') ||
    message.includes('not authenticated') ||
    message.includes('missing authorization header')
  );
};

const isNoOutputGeneratedError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  if (error instanceof Error) {
    if (
      error.name === 'AI_NoOutputGeneratedError' ||
      error.name === 'NoOutputGeneratedError'
    ) {
      return true;
    }
  }
  const flag = Symbol.for('vercel.ai.error.AI_NoOutputGeneratedError');
  return Boolean((error as Record<symbol, unknown>)[flag]);
};

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

  const apiTrustTokenStore = new ApiTrustTokenStore();
  const userApiKeyStore = new UserApiKeyStore();

  const getLlmConfig = async () => {
    const storedConfig = await userApiKeyStore.getConfig();
    if (!storedConfig) {
      return {
        api: 'openai',
        key: '',
        error: 'Missing API key.',
      } as LlmConfig;
    }
    return {
      api: storedConfig.provider,
      key: storedConfig.apiKey,
    };
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
          await Util.sleep(Math.random() * 200);
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
    if (getAuthMode() !== 'apikey') {
      try {
        const apiTrustToken = await apiTrustTokenStore.getToken();
        let apiTrustStream: AsyncGenerator<string, void, void> | null = null;
        if (apiTrustToken) {
          apiTrustStream = await getApiTrustStream({
            config: {
              clientId: apiTrustEnvVars.clientId,
              redirectUri: apiTrustEnvVars.redirectUri,
              apiUrl: apiTrustEnvVars.apiUrl,
            },
            tokenProvider: apiTrustToken,
            prompt,
            systemPrompt,
            attachments,
          });
          if (!apiTrustStream) {
            throw new Error(
              'ApiTrust login is active, but the request cannot be sent via ApiTrust.',
            );
          }
        }
        if (apiTrustStream) {
          yield* apiTrustStream;
          return;
        }
      } catch (error) {
        console.error('ApiTrust request failed', error);
        if (isApiTrustAuthError(error)) {
          try {
            // Token rejected; clear it so the UI can re-auth.
            await apiTrustTokenStore.setToken(null);
            console.warn(
              'ApiTrust token rejected; falling back to configured LLM provider.',
            );
          } catch (clearError) {
            console.warn('Failed to clear ApiTrust token', clearError);
          }
        } else {
          throw error;
        }
      }
    }

    const llmApi = await getLlmApi();
    if (llmApi) {
      const providerOptions = {
        openai: {
          reasoningEffort: reasoning,
          promptCacheKey: cacheKey ?? undefined,
        },
      };
      const promptObj = systemPrompt
        ? [
            {
              role: 'system' as const,
              content: systemPrompt,
            },
            {
              role: 'user' as const,
              content: attachments
                ? [
                    {
                      type: 'text' as const,
                      text: prompt,
                    },
                    ...attachments,
                  ]
                : prompt,
            },
          ]
        : prompt;
      const maxStreamRetries = 1;
      let lastError: unknown;

      for (let attempt = 0; attempt <= maxStreamRetries; attempt += 1) {
        const start = Date.now();
        let yielded = false;
        let first = true;
        try {
          const { textStream } = streamQueryer({
            model: llmApi[model],
            providerOptions,
            prompt: promptObj,
          });
          for await (const part of textStream) {
            if (first) {
              console.log(
                'Stream first token',
                cacheKey,
                Date.now() - start,
                part,
              );
              first = false;
            }
            yielded = true;
            yield part;
          }
          return;
        } catch (err) {
          lastError = err;
          if (isNoOutputGeneratedError(err) && !yielded) {
            if (attempt < maxStreamRetries) {
              console.warn('No output generated; retrying stream.', err);
              continue;
            }
          }
          throw err;
        }
      }

      throw lastError ?? new Error('No output generated.');
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
      model: 'hi' | 'mid' | 'low' = 'mid',
      reasoning: 'minimal' | 'low' | 'medium' | 'high' = 'low',
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
    const start = Date.now();
    let firstToken = -1;
    for await (const part of stream) {
      if (firstToken === -1) {
        firstToken = Date.now() - start;
      }
      result.push(part);
    }
    const done = Date.now() - start;
    if (result[0][0] === '{') {
      result[0] = `{ "firstToken": ${firstToken}, "done": ${done}, ${result[0].slice(1)}`;
    }
    return result.join('');
  };
}
