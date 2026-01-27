import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModelV2 } from '@ai-sdk/provider';
import type { FilePart, ImagePart, ModelMessage } from '@ai-sdk/provider-utils';
import { streamText } from 'ai';
import z from 'zod';
import fs from 'fs';
import { app } from 'electron';
import { envSchema, type Env } from '../schema/env.schema';
import { apiTrustEnvVars } from '../schema/env.node';
import { Util } from '../webView/util';
import { FirstTokenMonitor } from '../utils/llm';
import { ApiTrustTokenStore } from '../main/apiTrustTokenStore';
import { UserApiKeyStore } from '../main/userApiKeyStore';
import { getAuthMode } from '../main/authModeStore';
import { getApiTrustStream } from '../shared/aiGateway';

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
    baseUrl: z.string().optional(),
  });
  export type LlmConfig = z.infer<typeof llmConfigSchema>;
  export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
  export type LlmModelType = 'hi' | 'mid' | 'low';
  export type Attachment = ImagePart | FilePart;
  export type LlmApiModels = {
    provider: Env['provider'];
    hi: LanguageModelV2;
    mid: LanguageModelV2;
    low: LanguageModelV2;
  };

  export const ErrNoConfig = { error: 'No LLM config' } as const;

  const recordPath = `${app.getPath('userData')}/prompt-record`;
  const apiTrustTokenStore = new ApiTrustTokenStore();
  const userApiKeyStore = new UserApiKeyStore();

  try {
    fs.mkdirSync(recordPath);
  } catch (e) {}

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
      baseUrl: storedConfig.baseUrl,
    };
  };

  let llmApiPromise: Promise<LlmApiModels | null>;
  const getLlmApi = async (): Promise<LlmApiModels | null> => {
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
            console.info('createOpenAI', apiConfig);
            const openai = createOpenAI({
              apiKey: apiConfig.key,
              baseURL: apiConfig.baseUrl,
            });
            resolve({
              provider: 'openai',
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
          const monitor = new FirstTokenMonitor(cacheKey);
          monitor.start();
          try {
            for await (const part of apiTrustStream) {
              if (!monitor.hasReceived()) {
                monitor.onFirstToken(part);
              }
              yield part;
            }
          } catch (err) {
            monitor.stop();
            console.error('ApiTrust streaming error:', err);
            throw err;
          } finally {
            monitor.stop();
          }
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
      const providerOptions: Record<string, any> = {};
      if (llmApi.provider === 'openai') {
        providerOptions.openai = {
          reasoningEffort: reasoning,
        };
        if (cacheKey) {
          providerOptions.openai.promptCacheKey = cacheKey;
        }
      }
      const promptObj: string | Array<ModelMessage> = systemPrompt
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
        : prompt;
      const maxStreamRetries = 1;
      let lastError: unknown;

      for (let attempt = 0; attempt <= maxStreamRetries; attempt += 1) {
        const monitor = new FirstTokenMonitor(cacheKey);
        let yielded = false;
        let success = false;
        let response: Promise<any> | null = null;

        try {
          const streamResult = streamQueryer({
            model: llmApi[model],
            providerOptions,
            prompt: promptObj,
          });
          response = streamResult.response;
          monitor.start();

          for await (const part of streamResult.textStream) {
            if (!monitor.hasReceived()) {
              monitor.onFirstToken(part);
            }
            yielded = true;
            yield part;
          }
          success = true;
        } catch (err) {
          lastError = err;
          monitor.stop();
          if (isNoOutputGeneratedError(err) && !yielded) {
            if (attempt < maxStreamRetries) {
              console.warn('No output generated; retrying stream.', err);
              continue;
            }
          }
          console.error('Error during LLM streaming:', err);
          throw err;
        } finally {
          monitor.stop();
          if (success && response) {
            console.log(`api call ok ${cacheKey}`);
            try {
              const res = await response;
              let messages: ModelMessage[] = [];
              if (res) {
                messages = res.messages?.map((m: ModelMessage) => m?.content);
              }
              fs.writeFile(
                `${recordPath}/log-${new Date().toISOString()}.json`,
                JSON.stringify({ ...res, prompt: promptObj, messages }),
                () => {},
              );
            } catch (logError) {
              console.warn('Failed to write LLM log', logError);
            }
          }
        }

        if (success) return;
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
