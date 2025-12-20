import {
  PlannerResult,
  PlannerResultSchema,
  PlannerStep,
  PlannerStepSchema,
} from './planner.schema';
import { LlmApi } from '../../api';
import {
  JsonStreamingEvent,
  JsonStreamingEventType,
  JsonStreamingParser,
} from '../../jsonStreamer';

export class PlanningSession {
  runner: ReturnType<typeof LlmApi.queryLLMSession>;
  constructor(websiteHtmlParsers: Record<string, string> = {}) {
    this.runner = LlmApi.queryLLMSession(
      this.buildSystemPrompt(websiteHtmlParsers),
      'planner_',
    );
  }
  async *makePlan(
    prompt: string,
  ): AsyncGenerator<PlannerStep, PlannerResult, void> {
    const stream = this.runner(prompt);
    const jsonParser = new JsonStreamingParser(true);
    let events: JsonStreamingEvent[];
    let event: JsonStreamingEvent;
    let stepsStage = 0;
    for await (const chunk of stream) {
      events = jsonParser.push(chunk);
      for (event of events) {
        if (event.type === JsonStreamingEventType.Array) {
          if (event.key === 'steps') {
            stepsStage++;
          }
        } else if (
          event.type === JsonStreamingEventType.Object &&
          event.endValue
        ) {
          if (stepsStage === 1) {
            const step = PlannerStepSchema.safeParse(event.endValue);
            if (step.success) {
              yield step.data;
            } else {
              console.warn('Planner step error:', step.error);
            }
          } else if (event.key === null) {
            console.log('Planner result:', event.endValue);
            return PlannerResultSchema.parse(event.endValue);
          }
        }
      }
    }
    console.log('Planner end no result');
    return PlannerResultSchema.parse(JSON.parse(jsonParser.readAll()));
  }
  buildSystemPrompt(websiteHtmlParsers: Record<string, string>) {
    const parsers = Object.entries(websiteHtmlParsers);
    return `[system]
a web base agentic workflow task engine, perform action in agent browser according to user task prompt.

[role]
you are an action planner. taking user tasks prompt and compile into action guide for executor to work with.
LLM executor will take your step guide and dom to compile action details with querySelector.

[rules]
-core responsibilities:
 -user task prompt may contain task work across multiple pages. You only plan steps doable in **the current content found in [visible elements]**.
 -every step need to be able to connect with **at least one element** in [visible elements] provided, otherwise it is invalid.
 -put the tasks require page reload/form submit etc in todo, they will return to you after navigation.
 - you ONLY:
  - analyse the user task prompt with given [visible elements] from HTML
  - split it into ordered browser-like steps
  - each step MUST contain exactly ONE action (e.g. one click, one input, one scroll)
  - put action description in action field of Step with natural language, no code or pseudo code.
  - instructs executor to wait for loading if the action likely trigger loading or rerendering.
  - you may ask the executor to perform input or select element base on argument, **explicitly tell executor use argument with $keyName**.
  - assign a risk level to each step
  - optionally suggest a website specific html parser when appropriate
  - assume the url is opened and perform task on current page.
  - you should only ask_user_question when the task is really unclear or impossible to be done, user feedback will send to you again if asked.
  - you may require executor to return result by setting argument, set argument is an atomic action should be isolated from other steps.
  - provide key actions. browser engine will trigger pre-required action if possible, like focus before input, scroll and mouse move before click etc.
- always output only real interactive step. browser engine will generate pre-required action, like scroll & mouse move before click, focus before input etc. 
- prefer submit form with enter key over click button.

-risk levels:
- risk = 'l' | 'm' | 'h'
  - 'l' (low)   = scroll, click navigation link/button, mouse over, simple search, open page
  - 'm' (mid)   = fill form fields, drag & drop, submit data
  - 'h' (high)  = delete/remove, payment/checkout, irreversible settings, sensitive data operations
- always prioritise caution if user prompt mentions danger, careful, payment, delete, confidential data, or irreversible actions.
- you may ask the executor to set value to argument as key-value pair, which can reuse in other steps.

-scope limitations (very important):
- you ONLY describe what the step should do in natural language, from the browser user’s perspective.
${
  parsers.length
    ? `
-parser usage:
- for building more efficient html to executor, no parser = full visible html with minimal tree shaking
- only suggest parser names listed in [html parsers and usages] when they clearly match the task page type.
- if a parser is suitable for the main part of the task, set Task.p to that parser name.`
    : ''
}

[response json only]

  type Step = {
    action: string,
    risk: 'h' | 'm' | 'l',
  }

  type Response = {
    ${
      parsers.length
        ? `
    parser?: string,`
        : ''
    }
    steps: Step[],
    todo?: string,
    ask_user_question?: string,
  }

-no extra text:
- do NOT output explanations, comments, markdown, or prose outside the JSON.
- the entire response MUST be a single JSON object of type Response.

${
  parsers.length
    ? `
[html parsers and usages]
${parsers.map((parser) => `${parser[0]}=${parser[1]}`).join('\n')}`
    : ''
}
`;
  }
}

export class Planner {
  systemPrompt = ``;

  newPlanningSession(
    websiteHtmlParsers: Record<string, string> = {},
  ): PlanningSession {
    return new PlanningSession(websiteHtmlParsers);
  }
}
