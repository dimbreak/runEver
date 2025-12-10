import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { ExecutorLlmResultSchema } from "./roles/system/executor.schema"
import z from "zod";
import { LLMApiPart, ToBackgroundMsg } from "./type"
const llmKey = (async () => {
  const savedKeyRes = await browser.runtime.sendMessage({
    type: "GET_LLM_KEY",
  });
  if(savedKeyRes.success && savedKeyRes.key) {
    return savedKeyRes.key;
  }else{
    const key = prompt('llmKey', '');
    if (key) {
      browser.runtime.sendMessage({
        type: "SAVE_LLM_KEY",
        key,
      })
    }
    return key;
  }
})();
const openAi = (async () => {
  const apiKey = await llmKey;
  console.log('apiKey', apiKey);
  return apiKey ? createOpenAI({
    apiKey,
  }) : null;
})();

const queryLLMApiResultSchema = ExecutorLlmResultSchema;
type queryLLMApiResult = z.infer<typeof queryLLMApiResultSchema> | 'NO_RETRY: no key' | 'NO_RETRY: call error';

const requestHandlers: Record<string, (msg: {part?: string, eof?: boolean, error?: string})=>void> = {};

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(msg.type === 'LLM_API_STREAM') {
    if(msg.requestId) {
      const handler = requestHandlers[msg.requestId];
      if(handler) {
        handler(msg);
      }
    }
  }
  return true;
});

export const queryLLMSession = (systemPrompt: string) => {
  const cacheKey = `${Math.round(Math.random() * 1000000)}`;
  return (
    prompt: string,
    reasoning: Extract<ToBackgroundMsg, {type: 'CALL_LLM'}>['systemPrompt'] = 'low') => {
    return queryLLMApi(prompt, systemPrompt, cacheKey, reasoning);
  }
}

export async function* queryLLMApi (
  prompt: string,
                                  systemPrompt: string = '',
                                  cacheKey = '',
                                  reasoning: Extract<ToBackgroundMsg, {type: 'CALL_LLM'}>['systemPrompt'] = 'low'): AsyncGenerator<LLMApiPart, 'NO_RETRY: no key'|undefined, void> {
  if(await llmKey) {
    console.log(prompt);
    const requestId = (await browser.runtime.sendMessage({
      type: "CALL_LLM",
      prompt,
      systemPrompt,
      reasoning,
      cacheKey
    } as ToBackgroundMsg)).requestId;
    let part: LLMApiPart;
    let promise: Promise<LLMApiPart>;
    while (true) {
      promise = new Promise((resolve) => {
        requestHandlers[requestId] = resolve
      });
      yield promise;
      part = await promise;
      if(part.eof) {
        return;
      }
    }
  }else{
    return 'NO_RETRY: no key'
  }
}
