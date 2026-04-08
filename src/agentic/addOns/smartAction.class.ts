import { ExecutionTask } from '../task';
import { smartActionHeader } from '../prompts/header';

export class SmartActionSession extends ExecutionTask {
  constructor(
    intent: string,
    private parentSession: ExecutionTask,
    public name: string,
  ) {
    super(intent, 0, [], parentSession.session, parentSession);
    this.prompter.header = smartActionHeader;
    this.prompter.systemPrompt = `[${name} smart action]
${this.prompter.systemPrompt}`;
  }
}
