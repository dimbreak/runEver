import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProviderOptions,
} from '@ai-sdk/google';
import { LanguageModelV2, LanguageModelV3 } from '@ai-sdk/provider';
import type { FilePart, ImagePart, ModelMessage } from '@ai-sdk/provider-utils';
import { streamText, generateText } from 'ai';
import z from 'zod';
import fs from 'fs';
import { app } from 'electron';
import { envSchema, type Env } from '../schema/env.schema';
import { apiTrustEnvVars } from '../schema/env.node';
import { Util } from '../webView/util';
import { FirstTokenMonitor } from '../utils/llm';
import { ApiTrustTokenStore } from '../main/apiTrustTokenStore';
import { RuneverConfigStore } from '../main/runeverConfigStore';
import { getAuthMode } from '../main/authModeStore';
import { AsyncQueue } from '../utils/asyncQueue';
import { getApiTrustStream } from './providers/apiTrust';
import { createCodexWrapper } from './providers/codex';

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
    authMode: envSchema.shape.authMode,
  });
  export type LlmConfig = z.infer<typeof llmConfigSchema>;
  export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
  export type LlmModelType = 'hi' | 'mid' | 'low';
  export type Attachment = ImagePart | FilePart;
  export type LlmApiModels = {
    provider: Env['provider'];
    hi?: LanguageModelV2 | LanguageModelV3;
    mid?: LanguageModelV2 | LanguageModelV3;
    low?: LanguageModelV2 | LanguageModelV3;
    streaming: boolean;
    makeProviderOptions: (
      reason: ReasoningEffort,
      cacheKey: undefined | string,
    ) => Record<string, any>;
    queryStream?: (options: {
      prompt: string;
      systemPrompt?: string;
      attachments?: Attachment[] | null;
      cacheKey?: string;
      model: LlmModelType;
      reasoningEffort: ReasoningEffort;
    }) => Promise<{
      textStream: AsyncIterable<string>;
      response?: PromiseLike<any>;
    }>;
  };
  type ProviderFactory = (apiConfig: LlmConfig) => LlmApiModels;

  export const ErrNoConfig = { error: 'No LLM config' } as const;

  const recordPath = `${app.getPath('userData')}/prompt-record`;
  const apiTrustTokenStore = new ApiTrustTokenStore();
  const userApiKeyStore = RuneverConfigStore.getInstance();

  fs.mkdirSync(recordPath, { recursive: true });

  const PROVIDERS = {
    openai: (apiConfig) => {
      console.info('createOpenAI', apiConfig);
      const openai = createOpenAI({
        apiKey: apiConfig.key,
        baseURL: apiConfig.baseUrl,
      });
      return {
        provider: 'openai',
        hi: openai('gpt-5.4'),
        mid: openai('gpt-5-mini'),
        low: openai('gpt-5.4-nano'),
        streaming: true,
        makeProviderOptions: (
          reasoningEffort: ReasoningEffort,
          cacheKey: string | undefined,
        ) => {
          const providerOptions: Record<string, any> = {};
          providerOptions.openai = {
            reasoningEffort,
          };
          // if (cacheKey) {
          //   providerOptions.openai.promptCacheKey = cacheKey;
          // }
          return providerOptions;
        },
      };
    },
    google: (apiConfig) => {
      console.info('createGoogleGenerativeAI', apiConfig);
      const google = createGoogleGenerativeAI({
        apiKey: apiConfig.key,
        baseURL: apiConfig.baseUrl,
      });
      return {
        provider: 'google',
        hi: google('gemini-3-pro-preview'),
        mid: google('gemini-3-flash-preview'),
        low: google('gemini-3-flash-preview'),
        streaming: true,
        makeProviderOptions: (
          reasoningEffort: ReasoningEffort,
          cacheKey: string | undefined,
        ) => {
          const providerOptions: Record<string, any> = {};
          providerOptions.google = {
            thinkingConfig: {
              includeThoughts: true,
              thinkingLevel: reasoningEffort,
            },
          } satisfies GoogleGenerativeAIProviderOptions;
          return providerOptions;
        },
      };
    },
    zai: (apiConfig) => {
      console.info('createOpenAI(glm)', apiConfig);
      const zai = createOpenAICompatible({
        name: 'zai',
        apiKey: apiConfig.key,
        baseURL: apiConfig.baseUrl || 'https://open.bigmodel.cn/api/paas/v4',
      });
      return {
        provider: 'zai',
        hi: zai('glm-5'),
        mid: zai('glm-4.7-flash'),
        low: zai('glm-4.7-flash'),
        streaming: true,
        makeProviderOptions: (
          reasoningEffort: ReasoningEffort,
          cacheKey: string | undefined,
        ) => {
          return {};
        },
      };
    },
    codex: (apiConfig) => {
      console.info('createCodexWrapper', apiConfig);
      const codex = createCodexWrapper({
        apiKey: apiConfig.key,
        baseUrl: apiConfig.baseUrl,
        authMode: apiConfig.authMode,
      });
      return {
        provider: 'codex',
        streaming: true,
        makeProviderOptions: () => {
          return {};
        },
        queryStream: async ({
          prompt,
          systemPrompt,
          attachments,
          model,
          reasoningEffort,
        }) => {
          const result = await codex.stream({
            prompt,
            systemPrompt,
            attachments,
            model: codex.models[model],
            reasoningEffort,
          });
          return result;
        },
      };
    },
  } satisfies Record<Env['provider'], ProviderFactory>;

  const getLlmConfig = async () => {
    const storedConfig = await userApiKeyStore.getConfig('apiKey');
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
      authMode: storedConfig.authMode,
    };
  };

  let llmApiPromise: Promise<LlmApiModels | null>;
  const getLlmApi = async (): Promise<LlmApiModels | null> => {
    if (!llmApiPromise) {
      llmApiPromise = (async () => {
        const apiConfig = await getLlmConfig();
        console.log('apiConfig', apiConfig);
        if (apiConfig.error) {
          console.error('Failed to get LLM config', apiConfig.error);
          return null;
        }
        const providerFactory = PROVIDERS[apiConfig.api];
        if (!providerFactory) {
          throw new Error(`Unsupported LLM API: ${apiConfig.api}`);
        }
        return providerFactory(apiConfig);
      })();
    }
    return llmApiPromise;
  };

  const tryQueryApiTrust = async (options: {
    prompt: string;
    systemPrompt?: string;
    attachments?: Attachment[] | null;
    cacheKey?: string;
  }) => {
    if (getAuthMode() === 'apikey') {
      return null;
    }

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
          prompt: options.prompt,
          systemPrompt: options.systemPrompt,
          attachments: options.attachments,
        });
        if (!apiTrustStream) {
          throw new Error(
            'ApiTrust login is active, but the request cannot be sent via ApiTrust.',
          );
        }
      }
      if (!apiTrustStream) {
        return null;
      }

      const q = new AsyncQueue<string>();
      const monitor = new FirstTokenMonitor(options.cacheKey);
      monitor.start();

      (async () => {
        try {
          for await (const part of apiTrustStream) {
            if (!monitor.hasReceived()) {
              monitor.onFirstToken(part);
            }
            q.push(part);
          }
        } catch (err) {
          monitor.stop();
          console.error('ApiTrust streaming error:', err);
          q.fail(err as Error);
        } finally {
          monitor.stop();
          q.close();
        }
      })();

      return q;
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
        return null;
      }
      throw error;
    }
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
          end = Math.min(remain.length, Math.floor(Math.random() * 10 + 1));
          yield remain.slice(0, end);
          remain = remain.slice(end);
          await Util.sleep(Math.random() * 20 + 10);
        }
      })(),
    } as any as ReturnType<typeof streamText>;
  };

  export const addDummyReturn = (text: string | string[]) => {
    if (Array.isArray(text)) {
      text.forEach((item) => {
        if (item.startsWith('prompt-record/')) {
          // fs.readFile()
          const jsonStr = fs.readFileSync(`${__dirname}/../../${item}`, 'utf8');
          try {
            const j = JSON.parse(jsonStr);
            const res = (j.messages as any[][])[0].find(
              (m: any) => m.type === 'text',
            ).text;
            dummyReturns.push(res);
            console.log('addDummyReturn', item, res.slice(0, 32));
          } catch (e) {
            console.log('addDummyReturn', item);
            console.error('addDummyReturn', item, e);
          }
        } else {
          dummyReturns.push(item);
        }
      });
    } else {
      dummyReturns.push(text);
    }
    streamQueryer = streamDummy;
  };

  export async function queryLLMApi(
    prompt: string,
    systemPrompt = '',
    attachments: Attachment[] | null = null,
    cacheKey = '',
    model: LlmModelType = 'mid',
    reasoningEffort: ReasoningEffort = 'low',
  ): Promise<AsyncQueue<string>> {
    const apiTrustResult = await tryQueryApiTrust({
      prompt,
      systemPrompt,
      attachments,
      cacheKey,
    });
    if (apiTrustResult) {
      return apiTrustResult;
    }

    const llmApi = await getLlmApi();

    if (llmApi) {
      const q = new AsyncQueue<string>();
      const promptObj: string | Array<ModelMessage> = [
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
      ];
      if (systemPrompt) {
        promptObj.push({
          role: 'system',
          content: systemPrompt,
        });
      }
      const maxStreamRetries = 1;
      let lastError: unknown;

      (async () => {
        let streamer = streamQueryer;
        if (!llmApi.streaming) {
          streamer = fakeStreamer;
        }
        for (let attempt = 0; attempt <= maxStreamRetries; attempt += 1) {
          const monitor = new FirstTokenMonitor(cacheKey);
          let yielded = false;
          let shouldRetry = false;
          let response: PromiseLike<any> | null = null;

          try {
            const streamResult = llmApi.queryStream
              ? await llmApi.queryStream({
                  prompt,
                  systemPrompt,
                  attachments,
                  cacheKey,
                  model,
                  reasoningEffort,
                })
              : streamer({
                  model: llmApi[model]!,
                  providerOptions: llmApi.makeProviderOptions(
                    reasoningEffort,
                    cacheKey,
                  ),
                  prompt: promptObj,
                });
            response = streamResult.response ?? null;
            monitor.start();

            for await (const part of streamResult.textStream) {
              if (!monitor.hasReceived()) {
                monitor.onFirstToken(part);
              }
              yielded = true;
              q.push(part);
            }
            if (!yielded) {
              throw new Error('No output generated.');
            }
            if (response) {
              console.log(`api call ok ${cacheKey}`);
              try {
                const res = await response;
                let messages: ModelMessage[] = [];
                if (res) {
                  messages = res.messages?.map((m: ModelMessage) => m?.content);
                }
                fs.writeFile(
                  `${recordPath}/log-${new Date().toISOString().replace(/[^0-9]/g, '')}.json`,
                  JSON.stringify({ ...res, prompt: promptObj, messages }),
                  () => {},
                );
              } catch (logError) {
                console.warn('Failed to write LLM log', logError);
              }
            }
            q.close();
            return;
          } catch (err) {
            lastError = err;
            if (isNoOutputGeneratedError(err) && !yielded) {
              if (attempt < maxStreamRetries) {
                console.warn('No output generated; retrying stream.', err);
                shouldRetry = true;
              } else {
                lastError = new Error('No output generated.');
              }
            }
          } finally {
            monitor.stop();
          }
          if (shouldRetry) {
            continue;
          }
          console.error('Error during LLM streaming:', lastError);
          q.fail(lastError as Error);
          q.close();
          return;
        }
        if (lastError) {
          q.fail(lastError as Error);
        }
        q.close();
      })();
      return q;
    }
    throw ErrNoConfig;
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
      overrideSystemPrompt: string | undefined = undefined,
    ) => {
      return queryLLMApi(
        prompt,
        overrideSystemPrompt ?? systemPrompt,
        attachments,
        cacheKey,
        model,
        reasoning,
      );
    };
  };

  export const wrapStream = async (stream: AsyncQueue<string>) => {
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

  const fakeStreamer: any = (
    ...request: typeof streamText extends (...v: infer T) => any ? T : never
  ) => {
    const res = generateText({
      model: request[0].model,
      providerOptions: request[0].providerOptions,
      prompt:
        typeof request[0].prompt === 'string' ? request[0].prompt : undefined,
      messages: Array.isArray(request[0].prompt)
        ? (request[0].prompt as ModelMessage[])
        : undefined,
    } as any);
    return {
      request: request[0],
      textStream: (async function* () {
        let remain = (await res).text;
        let end = 0;
        while (remain.length) {
          end = Math.min(remain.length, Math.floor(Math.random() * 10 + 1));
          yield remain.slice(0, end);
          remain = remain.slice(end);
          await Util.sleep(Math.random() * 20 + 10);
        }
      })(),
      response: res.then((r) => r.response),
    } as any as ReturnType<typeof streamText>;
  };
}
