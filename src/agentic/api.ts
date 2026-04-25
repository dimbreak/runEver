import { createOpenAI } from '@ai-sdk/openai';
import {
  createMoonshotAI,
  MoonshotAILanguageModelOptions,
} from '@ai-sdk/moonshotai';
import { AlibabaLanguageModelOptions, createAlibaba } from '@ai-sdk/alibaba';
import {
  AnthropicLanguageModelOptions,
  createAnthropic,
} from '@ai-sdk/anthropic';
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
import { createXai, XaiLanguageModelChatOptions } from '@ai-sdk/xai';
import { createDeepSeek, DeepSeekLanguageModelOptions } from '@ai-sdk/deepseek';
import { createMinimax } from 'vercel-minimax-ai-provider';
import { Util } from '../webView/util';
import { FirstTokenMonitor } from '../utils/llm';
import { type StoredApiKey, StoredApiKeySchema } from '../schema/runeverConfig';
import { AsyncQueue } from '../utils/asyncQueue';
import { RuneverConfigStore } from '../main/runeverConfigStore';
import { createCodexWrapper } from './providers/codex';

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
    api: StoredApiKeySchema.shape.provider,
    key: StoredApiKeySchema.shape.apiKey,
    error: z.string().optional(),
    baseUrl: z.string().optional(),
    authMode: StoredApiKeySchema.shape.authMode,
  });

  export type LlmConfig = z.infer<typeof llmConfigSchema>;
  export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
  export type LlmModelType = 'hi' | 'mid' | 'low';
  export type Attachment = ImagePart | FilePart;
  export type LlmApiModels = {
    provider: StoredApiKey['provider'];
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

  export type CollectedStream = {
    text: string;
    firstTokenMs: number | null;
    totalTimeMs: number;
  };

  export type LlmApiClient = {
    getLlmApi: () => Promise<LlmApiModels | null>;
    queryLLMApi: (
      prompt: string,
      systemPrompt?: string,
      attachments?: Attachment[] | null,
      cacheKey?: string,
      model?: LlmModelType,
      reasoningEffort?: ReasoningEffort,
    ) => Promise<AsyncQueue<string>>;
    queryLLMSession: (
      systemPrompt: string,
      cacheKeyPrefix?: string,
    ) => (
      prompt: string,
      attachments?: Attachment[] | null,
      model?: LlmModelType,
      reasoning?: ReasoningEffort,
      overrideSystemPrompt?: string,
    ) => Promise<AsyncQueue<string>>;
  };

  type ProviderFactory = (apiConfig: LlmConfig) => LlmApiModels;
  type LlmConfigLoader = () => Promise<LlmConfig | null>;

  export const ErrNoConfig = { error: 'No LLM config' } as const;

  let defaultRecordPath: string | null = null;
  const getDefaultRecordPath = () => {
    if (defaultRecordPath === null) {
      defaultRecordPath = `${app.getPath('userData')}/prompt-record`;
      fs.mkdirSync(defaultRecordPath, { recursive: true });
    }
    return defaultRecordPath;
  };

  let userApiKeyStore: RuneverConfigStore | null = null;
  const getUserApiKeyStore = () => {
    if (!userApiKeyStore) {
      userApiKeyStore = RuneverConfigStore.getInstance();
    }
    return userApiKeyStore;
  };

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
        low: openai('gpt-5.4-mini'),
        streaming: true,
        makeProviderOptions: (
          reasoningEffort: ReasoningEffort,
          _cacheKey: string | undefined,
        ) => {
          return {
            openai: {
              reasoningEffort,
            },
          };
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
        hi: google('gemini-3.1-pro-preview'),
        mid: google('gemini-3-flash-preview'),
        low: google('gemini-3.1-flash-lite-preview'),
        streaming: true,
        makeProviderOptions: (
          reasoningEffort: ReasoningEffort,
          _cacheKey: string | undefined,
        ) => {
          return {
            google: {
              thinkingConfig: {
                includeThoughts: !!reasoningEffort,
                thinkingLevel: reasoningEffort,
              },
            } satisfies GoogleGenerativeAIProviderOptions,
          };
        },
        queryStream: async ({
          prompt,
          systemPrompt,
          attachments,
          cacheKey,
          model,
          reasoningEffort,
        }) => {
          const userMessage = createUserMessage(prompt, attachments);

          return streamText({
            model: google(
              {
                hi: 'gemini-3.1-pro-preview',
                mid: 'gemini-3-flash-preview',
                low: 'gemini-3.1-flash-lite-preview',
              }[model],
            ),
            maxRetries: 5,
            providerOptions: {
              google: {
                thinkingConfig: {
                  includeThoughts: !!reasoningEffort,
                  thinkingLevel: reasoningEffort,
                },
              } satisfies GoogleGenerativeAIProviderOptions,
            },
            system: systemPrompt || undefined,
            messages: [userMessage],
            experimental_context: cacheKey ? { cacheKey } : undefined,
          });
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
        hi: zai('z-ai/glm-5'),
        mid: zai('z-ai/glm-5'),
        low: zai('z-ai/glm-5'),
        streaming: true,
        makeProviderOptions: () => {
          return {};
        },
        queryStream: async ({
          prompt,
          systemPrompt,
          attachments,
          cacheKey,
          model,
        }) => {
          return streamText({
            model: zai(
              {
                hi: 'glm-5',
                mid: 'glm-5',
                low: 'glm-5',
              }[model],
            ),
            system: buildProviderSystemPrompt('zai', systemPrompt) || undefined,
            messages: [createUserMessage(prompt, attachments)],
            experimental_context: cacheKey ? { cacheKey } : undefined,
          });
        },
      };
    },
    anthropic: (apiConfig) => {
      const anthropic = createAnthropic({
        apiKey: apiConfig.key,
        baseURL: apiConfig.baseUrl,
      });
      return {
        provider: 'anthropic',
        hi: anthropic('claude-opus-4-6'),
        mid: anthropic('claude-sonnet-4-6'),
        low: anthropic('claude-sonnet-4-6'),
        streaming: true,
        makeProviderOptions: (reasoningEffort: ReasoningEffort) => {
          return {
            anthropic: {
              effort: reasoningEffort === 'minimal' ? 'low' : reasoningEffort,
            } satisfies AnthropicLanguageModelOptions,
          };
        },
        queryStream: async ({
          prompt,
          systemPrompt,
          attachments,
          cacheKey,
          model,
          reasoningEffort,
        }) => {
          const anthropicSystemPrompt = buildProviderSystemPrompt(
            'anthropic',
            systemPrompt,
          );
          const streamResult = streamText({
            model: anthropic(
              {
                hi: 'claude-opus-4-6',
                mid: 'claude-sonnet-4-6',
                low: 'claude-sonnet-4-6',
              }[model],
            ),
            providerOptions: {
              anthropic: {
                effort: reasoningEffort === 'minimal' ? 'low' : reasoningEffort,
              } satisfies AnthropicLanguageModelOptions,
            },
            system: anthropicSystemPrompt || undefined,
            messages: [createUserMessage(prompt, attachments)],
            experimental_context: cacheKey ? { cacheKey } : undefined,
          });

          return {
            response: streamResult.response,
            textStream: (async function* () {
              let buffer = '';
              let shouldBuffer = false;
              let decided = false;

              for await (const part of streamResult.textStream) {
                buffer += part;

                if (!decided) {
                  const trimmed = buffer.trimStart();
                  if (!trimmed) {
                    continue;
                  }

                  decided = true;
                  shouldBuffer = !(
                    trimmed.startsWith('{') || trimmed.startsWith('[')
                  );

                  if (!shouldBuffer) {
                    yield buffer;
                    buffer = '';
                  }
                  continue;
                }

                if (!shouldBuffer) {
                  yield part;
                }
              }

              if (shouldBuffer) {
                const salvaged = salvageClaudeJsonOutput(buffer);
                if (salvaged !== buffer) {
                  console.warn(
                    'Anthropic output salvaged to JSON-only response.',
                  );
                }
                yield* splitIntoChunks(salvaged);
              }
            })(),
          };
        },
      };
    },
    xai: (apiConfig) => {
      const zai = createXai({
        apiKey: apiConfig.key,
        baseURL: apiConfig.baseUrl,
      });
      return {
        provider: 'xai',
        hi: zai('x-ai/grok-4.20'),
        mid: zai('x-ai/grok-4.20'),
        low: zai('grok-4.1-fast'),
        streaming: true,
        makeProviderOptions: (reasoningEffort: ReasoningEffort) => {
          return {
            xai: {
              reasoningEffort: {
                minimal: 'low',
                low: 'low',
                medium: 'high',
                high: 'high',
              }[reasoningEffort || 'low'] as 'high' | 'low',
            } satisfies XaiLanguageModelChatOptions,
          };
        },
      };
    },
    alibaba: (apiConfig) => {
      const alibaba = createAlibaba({
        apiKey: apiConfig.key,
        baseURL: apiConfig.baseUrl,
      });
      return {
        provider: 'alibaba',
        hi: alibaba('qwen/qwen3.6-plus'),
        mid: alibaba('qwen3.5-397b-a17b'),
        low: alibaba('qwen3.5-122b-a10b'),
        streaming: true,
        makeProviderOptions: (reasoningEffort: ReasoningEffort) => {
          return {
            alibaba: {
              enableThinking: !!reasoningEffort,
              thinkingBudget: {
                minimal: 128,
                low: 512,
                medium: 2048,
                high: 5120,
              }[reasoningEffort || 'low'],
            } satisfies AlibabaLanguageModelOptions,
          };
        },
      };
    },
    deepseek: (apiConfig) => {
      const deepseek = createDeepSeek({
        apiKey: apiConfig.key,
        baseURL: apiConfig.baseUrl,
      });
      return {
        provider: 'deepseek',
        hi: deepseek('deepseek/deepseek-v4-pro'),
        mid: deepseek('deepseek/deepseek-v4-flash'),
        low: deepseek('deepseek-v3.2'),
        streaming: true,
        makeProviderOptions: (reasoningEffort: ReasoningEffort) => {
          return {
            deepseek: {
              thinking: { type: reasoningEffort ? 'enabled' : 'disabled' },
            } satisfies DeepSeekLanguageModelOptions,
          };
        },
        queryStream: async ({
          prompt,
          systemPrompt,
          attachments,
          cacheKey,
          model,
          reasoningEffort,
        }) => {
          const streamResult = streamText({
            model: deepseek(
              {
                hi: 'deepseek/deepseek-v4-pro',
                mid: 'deepseek/deepseek-v4-flash',
                low: 'deepseek-v3.2',
              }[model],
            ),
            providerOptions: {
              deepseek: {
                thinking: { type: reasoningEffort ? 'enabled' : 'disabled' },
              } satisfies DeepSeekLanguageModelOptions,
            },
            system:
              buildProviderSystemPrompt('deepseek', systemPrompt) ||
              undefined,
            messages: [createUserMessage(prompt, attachments)],
            experimental_context: cacheKey ? { cacheKey } : undefined,
          });

          return {
            response: streamResult.response,
            textStream: (async function* () {
              let buffer = '';
              let shouldBuffer = false;
              let decided = false;

              for await (const part of streamResult.textStream) {
                buffer += part;

                if (!decided) {
                  const trimmed = buffer.trimStart();
                  if (!trimmed) {
                    continue;
                  }

                  decided = true;
                  shouldBuffer = !(
                    trimmed.startsWith('{') || trimmed.startsWith('[')
                  );

                  if (!shouldBuffer) {
                    yield buffer;
                    buffer = '';
                  }
                  continue;
                }

                if (!shouldBuffer) {
                  yield part;
                }
              }

              if (shouldBuffer) {
                const salvaged = salvageClaudeJsonOutput(buffer);
                if (salvaged !== buffer) {
                  console.warn('DeepSeek output salvaged to JSON-only response.');
                }
                yield* splitIntoChunks(salvaged);
              }
            })(),
          };
        },
      };
    },
    minimax: (apiConfig) => {
      const minimax = createMinimax({
        apiKey: apiConfig.key,
        baseURL: apiConfig.baseUrl,
      });
      return {
        provider: 'minimax',
        hi: minimax('minimax/minimax-m2.7'),
        mid: minimax('MiniMax-M2.7'),
        low: minimax('MiniMax-M2.7'),
        streaming: true,
        makeProviderOptions: () => {
          return {};
        },
      };
    },
    moonshot: (apiConfig) => {
      const moonshot = createMoonshotAI({
        apiKey: apiConfig.key,
        baseURL: apiConfig.baseUrl,
      });
      return {
        provider: 'moonshot',
        hi: moonshot('moonshotai/kimi-k2.5'),
        mid: moonshot('moonshotai/kimi-k2.5'),
        low: moonshot('moonshotai/kimi-k2.5'),
        streaming: true,
        makeProviderOptions: (reasoningEffort: ReasoningEffort) => {
          return {
            moonshotai: {
              thinking: {
                type: reasoningEffort ? 'enabled' : 'disabled',
                budgetTokens: {
                  minimal: 128,
                  low: 512,
                  medium: 2048,
                  high: 5120,
                }[reasoningEffort || 'low'],
              },
            } satisfies MoonshotAILanguageModelOptions,
          };
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
  } satisfies Record<StoredApiKey['provider'], ProviderFactory>;

  const getLlmConfig = async () => {
    const storedConfig = await getUserApiKeyStore().getConfig('apiKey');
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

  const createUserMessage = (
    prompt: string,
    attachments: Attachment[] | null = null,
  ): ModelMessage => {
    return {
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
    };
  };

  const buildStrictJsonSystemPrompt = (
    providerName: string,
    systemPrompt = '',
  ) => {
    const strictJsonSuffix = `

CRITICAL OUTPUT CONTRACT FOR ${providerName.toUpperCase()}:
- Output raw JSON only.
- Your first character must be '{' and your last character must be '}'.
- Do not output markdown fences like \`\`\`json.
- Do not output any preamble, explanation, thinking, narration, apology, commentary, bullet list, or analysis before or after the JSON.
- Do not describe the plan in prose. Put the plan only inside the JSON fields required by the executor schema.
- Any non-JSON text will be treated as a formatting failure by the executor and scored as wrong.
- This benchmark is strict about wire-format obedience. A mostly-correct answer with extra prose still fails.
- Other models on this same benchmark already return clean raw JSON. Losing on format discipline is avoidable and unacceptable.
- If you are about to write anything except the JSON object, stop and output the JSON object directly.
`;

    if (!systemPrompt) {
      return strictJsonSuffix.trim();
    }

    return `${systemPrompt.trim()}\n${strictJsonSuffix}`.trim();
  };

  const buildProviderSystemPrompt = (
    provider: StoredApiKey['provider'],
    systemPrompt = '',
  ) => {
    if (
      provider === 'anthropic' ||
      provider === 'zai' ||
      provider === 'moonshot' ||
      provider === 'minimax' ||
      provider === 'deepseek'
    ) {
      return buildStrictJsonSystemPrompt(provider, systemPrompt);
    }

    return systemPrompt;
  };

  const stripMarkdownFence = (text: string) => {
    const trimmed = text.trim();
    const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1].trim() : trimmed;
  };

  const extractBalancedJson = (text: string) => {
    const candidates = ['{"a"', '{\n  "a"', '{\n"a"', '{'];
    const starts = [
      ...new Set(
        candidates
          .map((needle) => text.indexOf(needle))
          .filter((idx) => idx >= 0),
      ),
    ];

    for (const start of starts) {
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let index = start; index < text.length; index += 1) {
        const ch = text[index];

        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === '\\') {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }

        if (ch === '"') {
          inString = true;
          continue;
        }

        if (ch === '{') {
          depth += 1;
          continue;
        }

        if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            return text.slice(start, index + 1).trim();
          }
        }
      }
    }

    return null;
  };

  const salvageClaudeJsonOutput = (text: string) => {
    const fenced = stripMarkdownFence(text);
    try {
      JSON.parse(fenced);
      return fenced;
    } catch {}

    const extracted = extractBalancedJson(text);
    if (extracted) {
      try {
        JSON.parse(extracted);
        return extracted;
      } catch {}
    }

    return text;
  };

  const splitIntoChunks = async function* (text: string) {
    let remain = text;
    while (remain.length > 0) {
      const end = Math.min(remain.length, Math.floor(Math.random() * 10 + 1));
      yield remain.slice(0, end);
      remain = remain.slice(end);
      await Util.sleep(Math.random() * 20 + 10);
    }
  };

  const createPromptObject = (
    provider: StoredApiKey['provider'],
    prompt: string,
    systemPrompt = '',
    attachments: Attachment[] | null = null,
  ): Array<ModelMessage> => {
    const resolvedSystemPrompt = buildProviderSystemPrompt(
      provider,
      systemPrompt,
    );
    const userMessage = createUserMessage(prompt, attachments);

    if (provider === 'google' || !resolvedSystemPrompt) {
      return [userMessage];
    }

    return [
      {
        role: 'system',
        content: resolvedSystemPrompt,
      },
      userMessage,
    ];
  };

  const tryQueryApiTrust = async (_options: {
    prompt: string;
    systemPrompt?: string;
    attachments?: Attachment[] | null;
    cacheKey?: string;
  }) => {
    return null;
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
          const jsonStr = fs.readFileSync(`${__dirname}/../../${item}`, 'utf8');
          try {
            const record = JSON.parse(jsonStr);
            const res = (record.messages as any[][])[0].find(
              (message: any) => message.type === 'text',
            ).text;
            dummyReturns.push(res);
            console.log('addDummyReturn', item, res.slice(0, 32));
          } catch (error) {
            console.log('addDummyReturn', item);
            console.error('addDummyReturn', item, error);
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

  const createClientInternal = (
    configLoader: LlmConfigLoader,
    options: {
      recordPath?: string | null;
    } = {},
  ): LlmApiClient => {
    let llmApiPromise: Promise<LlmApiModels | null> | undefined;

    const getClientRecordPath = () => {
      if (options.recordPath === undefined) {
        return getDefaultRecordPath();
      }
      if (options.recordPath) {
        fs.mkdirSync(options.recordPath, { recursive: true });
      }
      return options.recordPath ?? null;
    };

    const getLlmApi = async (): Promise<LlmApiModels | null> => {
      if (!llmApiPromise) {
        llmApiPromise = (async () => {
          const apiConfig = await configLoader();
          console.log('apiConfig', apiConfig);
          if (!apiConfig || apiConfig.error) {
            console.error(
              'Failed to get LLM config',
              apiConfig?.error || 'Missing config',
            );
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

    // eslint-disable-next-line @typescript-eslint/no-shadow
    const queryLLMApi = async (
      prompt: string,
      systemPrompt = '',
      attachments: Attachment[] | null = null,
      cacheKey = '',
      model: LlmModelType = 'mid',
      reasoningEffort: ReasoningEffort = 'low',
    ): Promise<AsyncQueue<string>> => {
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
      if (!llmApi) {
        throw ErrNoConfig;
      }

      const q = new AsyncQueue<string>();
      const promptObj = createPromptObject(
        llmApi.provider,
        prompt,
        systemPrompt,
        attachments,
      );
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
                  messages = res.messages?.map(
                    (message: ModelMessage) => message?.content,
                  );
                }

                const recordPath = getClientRecordPath();
                if (recordPath) {
                  fs.writeFile(
                    `${recordPath}/log-${new Date().toISOString().replace(/[^0-9]/g, '')}.json`,
                    JSON.stringify({ ...res, prompt: promptObj, messages }),
                    () => {},
                  );
                }
              } catch (logError) {
                console.warn('Failed to write LLM log', logError);
              }
            }

            q.close();
            return;
          } catch (error) {
            lastError = error;
            if (isNoOutputGeneratedError(error) && !yielded) {
              if (attempt < maxStreamRetries) {
                console.warn('No output generated; retrying stream.', error);
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
    };

    const queryLLMSession = (systemPrompt: string, cacheKeyPrefix = '') => {
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

    return {
      getLlmApi,
      queryLLMApi,
      queryLLMSession,
    };
  };

  let defaultClient: LlmApiClient | undefined;
  const getDefaultClient = () => {
    if (!defaultClient) {
      defaultClient = createClientInternal(async () => getLlmConfig());
    }
    return defaultClient;
  };

  export const createClient = (
    config: LlmConfig | LlmConfigLoader,
    options: {
      recordPath?: string | null;
    } = {},
  ) => {
    const loader: LlmConfigLoader =
      typeof config === 'function' ? config : async () => config;
    return createClientInternal(loader, options);
  };

  export async function queryLLMApi(
    prompt: string,
    systemPrompt = '',
    attachments: Attachment[] | null = null,
    cacheKey = '',
    model: LlmModelType = 'mid',
    reasoningEffort: ReasoningEffort = 'low',
  ): Promise<AsyncQueue<string>> {
    return getDefaultClient().queryLLMApi(
      prompt,
      systemPrompt,
      attachments,
      cacheKey,
      model,
      reasoningEffort,
    );
  }

  export const queryLLMSession = (
    systemPrompt: string,
    cacheKeyPrefix = '',
  ) => {
    return getDefaultClient().queryLLMSession(systemPrompt, cacheKeyPrefix);
  };

  export const collectStream = async (
    stream: AsyncIterable<string | null | undefined>,
  ): Promise<CollectedStream> => {
    const result: string[] = [];
    const start = Date.now();
    let firstTokenMs: number | null = null;

    for await (const part of stream) {
      if (firstTokenMs === null) {
        firstTokenMs = Date.now() - start;
      }
      result.push(part ?? '');
    }

    return {
      text: result.join(''),
      firstTokenMs,
      totalTimeMs: Date.now() - start,
    };
  };

  export const wrapStream = async (stream: AsyncQueue<string>) => {
    const result = await collectStream(stream);
    if (result.text[0] === '{') {
      return `{ "firstToken": ${result.firstTokenMs ?? -1}, "done": ${result.totalTimeMs}, ${result.text.slice(1)}`;
    }
    return result.text;
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
      response: res.then((response) => response.response),
    } as any as ReturnType<typeof streamText>;
  };
}
