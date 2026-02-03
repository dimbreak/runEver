import { ExecutionSession } from '../session';
import { smartActionHeader } from '../prompts/header';

export class SmartActionSession extends ExecutionSession {
  constructor(
    private parentSession: ExecutionSession,
    public name: string,
  ) {
    super(0, [], parentSession.run, parentSession);
    this.prompter.header = smartActionHeader;
    this.prompter.systemPrompt = `[${name} smart action]
${this.prompter.systemPrompt}`;
  }
}
