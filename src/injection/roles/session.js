import { queryLLMSession } from "../llm";
const promptedCache = JSON.parse(localStorage.getItem('runEver_prompt_cache') ?? '{}');
export class Session {
    constructor(role, promptTransformer) {
        Object.defineProperty(this, "role", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: role
        });
        Object.defineProperty(this, "promptTransformer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: promptTransformer
        });
        Object.defineProperty(this, "conversations", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "systemPrompt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "promptRunner", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.systemPrompt = role.systemPrompt;
        this.promptRunner = queryLLMSession(this.systemPrompt);
    }
    async newPrompt(prompt) {
        if (prompt.startsWith('!')) {
            prompt = prompt.slice(1);
        }
        else {
            if (promptedCache[prompt]) {
                console.log('done cache', promptedCache[prompt]);
                return this.role.parseLLMResult(promptedCache[prompt]);
            }
        }
        const rr = [prompt];
        this.conversations.push(rr);
        const startTs = Date.now();
        const stream = this.promptRunner(this.promptTransformer(prompt));
        const parts = [];
        for await (const part of stream) {
            console.log('part', Date.now() - startTs, part);
            parts.push(part.part ?? '');
            if (part.error) {
                throw new Error(part.error);
            }
            else if (part.eof) {
                break;
            }
        }
        const resp = parts.join('');
        promptedCache[rr[0]] = resp;
        localStorage.setItem('runEver_prompt_cache', JSON.stringify(promptedCache));
        rr.push(resp);
        console.log('done', Date.now() - startTs, resp);
        return this.role.parseLLMResult(resp);
    }
}
