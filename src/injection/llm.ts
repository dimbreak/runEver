import { createOpenAI } from '@ai-sdk/openai';
import { ExecutorLlmResultSchema } from './roles/system/executor.schema';
import z from 'zod';
import { LLMApiPart, ToBackgroundMsg } from './type';

// Typed browser API fallback
const browserApi: typeof browser | typeof chrome =
  typeof browser !== 'undefined' ? browser : chrome;

type StreamMsg = {
  type: 'LLM_API_STREAM';
  requestId?: string;
  part?: string;
  eof?: boolean;
  error?: string;
};

const llmKey: Promise<string | null> = (async () => {
  const savedKeyRes = (await browserApi.runtime.sendMessage({
    type: 'GET_LLM_KEY',
  })) as { success: boolean; key?: string };
  if (savedKeyRes.success && savedKeyRes.key) {
    return savedKeyRes.key;
  }
  const key = prompt('llmKey', '') || null;
  if (key) {
    browserApi.runtime.sendMessage({
      type: 'SAVE_LLM_KEY',
      key,
    });
  }
  return key;
})();

// Keep for future direct client usage; not currently used
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const openAi = (async () => {
  const apiKey = await llmKey;
  return apiKey ? createOpenAI({ apiKey }) : null;
})();

const queryLLMApiResultSchema = ExecutorLlmResultSchema;
type queryLLMApiResult =
  | z.infer<typeof queryLLMApiResultSchema>
  | 'NO_RETRY: no key'
  | 'NO_RETRY: call error';

const requestHandlers: Record<string, (msg: StreamMsg) => void> = {};

browserApi.runtime.onMessage.addListener((msg: StreamMsg) => {
  if (msg.type === 'LLM_API_STREAM' && msg.requestId) {
    const handler = requestHandlers[msg.requestId];
    if (handler) handler(msg);
  }
  return true;
});

export const queryLLMSession = (systemPrompt: string) => {
  const cacheKey = `${Math.round(Math.random() * 1000000)}`;
  return (
    prompt: string,
    reasoning: Extract<ToBackgroundMsg, { type: 'CALL_LLM' }>['systemPrompt'] = 'low',
  ) => {
    return queryLLMApi(prompt, systemPrompt, cacheKey, reasoning);
  };
};

export async function* queryLLMApi(
  prompt: string,
  systemPrompt = '',
  cacheKey = '',
  reasoning: Extract<ToBackgroundMsg, { type: 'CALL_LLM' }>['systemPrompt'] = 'low',
): AsyncGenerator<LLMApiPart, 'NO_RETRY: no key' | undefined, void> {
  if (await llmKey) {
    const msg = (await browserApi.runtime.sendMessage({
      type: 'CALL_LLM',
      prompt,
      systemPrompt,
      reasoning,
      cacheKey,
    } as ToBackgroundMsg)) as { requestId: string };

    const requestId = msg.requestId;
    while (true) {
      const part = await new Promise<LLMApiPart>((resolve) => {
        requestHandlers[requestId] = resolve;
      });
      yield part;
      if (part.eof) return;
    }
  } else {
    return 'NO_RETRY: no key';
  }
}
