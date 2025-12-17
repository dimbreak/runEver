import { type ZodSafeParseResult } from 'zod';
import {
  PlannerResult,
  PlannerResultSchema,
  PlannerStep,
  PlannerStepSchema,
} from './planner.schema';
import { LlmApi } from '../../api';

const stepsRx = /"steps"\s?:\s?\[/;

export class PlanningSession {
  runner: ReturnType<typeof LlmApi.queryLLMSession>;
  constructor(websiteHtmlParsers: Record<string, string> = {}) {
    this.runner = LlmApi.queryLLMSession(
      this.buildSystemPrompt(websiteHtmlParsers),
    );
  }
  async *newPlan(
    prompt: string,
  ): AsyncGenerator<PlannerStep, PlannerResult, void> {
    const stream = this.runner(prompt);
    let resultString = '';
    let stepStage = 0;
    let stepStarts = 0;
    let inStep = false;
    let resultLen = 0;
    let step: ZodSafeParseResult<PlannerStep> | undefined;
    for await (const chunk of stream) {
      resultString += chunk;
      if (stepStage === 0) {
        if (chunk.includes('[') && stepsRx.test(resultString)) {
          console.log('start steps', resultString);
          stepStage = 1;
        }
      } else if (stepStage === 1) {
        if (chunk.includes('{')) {
          console.log('new step', resultString);
          stepStarts = resultLen + chunk.indexOf('{');
          inStep = true;
        } else if (!inStep && chunk.startsWith(']')) {
          console.log('end steps', resultString);
          stepStage = 2;
        } else if (!chunk.includes('}')) {
          continue;
        }
        if (inStep) {
          const pos = chunk.indexOf('}');
          console.log(
            'try step',
            resultString.slice(stepStarts, resultLen + pos + 1),
          );
          step = PlannerStepSchema.safeParse(
            JSON.parse(resultString.slice(stepStarts, resultLen + pos + 1)),
          );
          if (step.success) {
            yield step.data;
            inStep = false;
            if (chunk.length > pos + 1 && chunk[pos + 1] === ']') {
              console.log('end steps same chunk', resultString);
              stepStage = 2;
            }
          }
        }
      }
      resultLen += chunk.length;
    }
    return PlannerResultSchema.parse(JSON.parse(resultString));
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
- you ONLY:
  - analyse the user task prompt with given [visible elements] from HTML
  - split it into ordered browser-like steps
  - each step MUST contain exactly ONE action (e.g. one click, one input, one scroll)
  - put action description in action field of Step with natural language, no code or pseudo code.
  - plan steps doable in the current layout in [visible elements], steps likely require loading or rerendering should be skipped from steps section, put in todo section.
  - instructs executor to wait for loading if the action likely trigger loading or rerendering.
  - you may ask the executor to perform input or select element base on argument, to make the action dynamic and reusable.
  - assign a risk level to each step
  - optionally suggest a website specific html parser when appropriate
  - assume the url is opened, need no initial action to go unless user specified.
  - you should only ask_user_question when the task is really unclear or impossible to be done, user feedback will send to you again if asked.
  - you may require executor to return result by setting argument, setting argument is an atomic action should be isolated from other steps.
  - provide key actions. browser engine will trigger pre-required action if possible, like focus before input, scroll and mouse move before click etc.

-risk levels:
- risk = 'l' | 'm' | 'h'
  - 'l' (low)   = scroll, click navigation link/button, mouse over, simple search, open page
  - 'm' (mid)   = fill form fields, drag & drop, submit data
  - 'h' (high)  = delete/remove, payment/checkout, irreversible settings, sensitive data operations
- always prioritise caution if user prompt mentions danger, careful, payment, delete, confidential data, or irreversible actions.
- you may ask the executor to set value to argument as key-value pair, which can reuse in other steps.

-scope limitations (very important):
- you ONLY describe what the step should do in natural language, from the browser user’s perspective.
- you MUST NOT:
  - design or output any CSS selector, XPath, or concrete querySelector
  - reason about or mention DOM tree structure, node indices, coordinates, or bounding boxes
  - control, limit, or comment on the executor’s reasoning depth, time, or token usage
  - describe implementation details of the executor (no algorithms, no pseudo code, no internal policies)
  - talk about model behaviour, latency, cost, or performance
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
