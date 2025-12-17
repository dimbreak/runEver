import { LlmApi } from '../api';

const promptedCache: Record<string, string> = {};

export class LlmSession {
  promptRunner: ReturnType<typeof LlmApi.queryLLMSession>;
  conversations: ([string] | [string, string])[] = [];

  constructor(systemPrompt: string) {
    this.promptRunner = LlmApi.queryLLMSession(systemPrompt);
  }

  async *streamPrompt(
    rawPrompt: string,
  ): AsyncGenerator<string, 'NO_RETRY: no key' | string, void> {
    let prompt = rawPrompt;
    if (prompt.startsWith('!')) {
      prompt = prompt.slice(1);
    } else if (promptedCache[prompt]) {
      console.log('done cache', promptedCache[prompt]);
      return promptedCache[prompt];
    }
    const rr: [string] = [prompt];
    this.conversations.push(rr);
    const startTs = Date.now();
    const stream = this.promptRunner(prompt);
    const parts = [];
    for await (let part of stream) {
      part = part ?? '';
      parts.push(part);
      yield part;
    }
    const resp = parts.join('');
    promptedCache[rr[0]] = resp;
    localStorage.setItem('runEver_prompt_cache', JSON.stringify(promptedCache));
    rr.push(resp);
    console.log('done', Date.now() - startTs, resp);
    return resp;
  }
}
