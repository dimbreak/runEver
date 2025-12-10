import { Session } from "./session";
export class Role {
    constructor() {
        Object.defineProperty(this, "systemPrompt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    newSession(promptTransformer = defaultPromptTransformer) {
        return new Session(this, promptTransformer);
    }
}
const defaultPromptTransformer = (prompt) => `[url]
${location.href}

[user prompt]
${prompt}
`;
