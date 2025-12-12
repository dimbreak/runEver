import './browser-polyfill.js';
import { queryLLMApi } from './llm.js';
import { defaultExecutor } from './roles/default';
import { llmErrorPromptTpl } from './roles/system/executor';
import { ExecutorLlmResult } from './roles/system/executor.schema.js';
import { LlmAction } from './schema.js';
import { ToBackgroundMsg, WorkflowRecord } from './type';

const MAX_LLM_RETRY_LIMIT = 2;

function addIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'indicator';
  indicator.style.position = 'fixed';
  indicator.style.top = '0px';
  indicator.style.left = '0px';
  document.body.appendChild(indicator);
  return indicator;
}

const indicator = addIndicator();

async function callLLMApi(
  prompt: string,
  reasoning: Extract<
    ToBackgroundMsg,
    { type: 'CALL_LLM' }
  >['reasoning'] = 'low',
  retry = 0,
): Promise<ExecutorLlmResult> {
  const session = defaultExecutor.newSession();
  const { systemPrompt } = session;
  const stream = queryLLMApi(prompt, systemPrompt, '', reasoning);

  // Collect all parts from the stream
  const parts: string[] = [];
  let error: string | undefined;
  let eof = false;

  for await (const part of stream) {
    if (part.error) {
      error = part.error;
      break;
    }
    if (part.eof) {
      eof = true;
      break;
    }
    if (part.part) {
      parts.push(part.part);
    }
  }

  // Check for early return (no key)
  const resultStr = parts.join('');
  if (error || !eof) {
    const errorMsg = error || 'NO_RETRY: incomplete response';
    if (errorMsg.startsWith('NO_RETRY')) {
      return {
        actions: [],
        error: errorMsg,
      };
    }
    if (retry < MAX_LLM_RETRY_LIMIT) {
      return callLLMApi(
        llmErrorPromptTpl(prompt, errorMsg),
        reasoning,
        retry + 1,
      );
    }
    return {
      actions: [],
      error: errorMsg,
    };
  }

  // Parse the JSON result
  try {
    const parsed = JSON.parse(resultStr);
    const result = defaultExecutor.parseLLMResult(resultStr);
    if (result.error && !result.error.startsWith('NO_RETRY')) {
      if (retry < MAX_LLM_RETRY_LIMIT) {
        return callLLMApi(
          llmErrorPromptTpl(prompt, result.error),
          reasoning,
          retry + 1,
        );
      }
    }
    return result;
  } catch (e) {
    const parseError = `NO_RETRY: parse error ${String(e)}`;
    if (retry < MAX_LLM_RETRY_LIMIT) {
      return callLLMApi(
        llmErrorPromptTpl(prompt, parseError),
        reasoning,
        retry + 1,
      );
    }
    return {
      actions: [],
      error: parseError,
    };
  }
}

const runWithLLM = async (prompt: string, workflowRecord?: WorkflowRecord) => {
  const llmResult = await callLLMApi(prompt);
  if (llmResult.error) {
    const errorEl = indicator.querySelector('#error');
    if (errorEl) {
      errorEl.innerHTML = llmResult.error;
    }
    return;
  }
  if (
    await runLlmActions(llmResult.actions, {
      workflowRec: workflowRecord,
      getIsTabActive: () => isTabActive,
      runWorkflowTaskStep,
    })
  ) {
    // Actions completed successfully
  }
};

// const MAX_RETRY = 3;

/**
 * Executes the LLM-generated actions on the page
 * @param actions Array of actions to execute
 * @param context Context object containing workflow record and helper functions
 * @returns Promise<boolean> indicating successful execution
 * @todo Implement actual action execution logic for mouse, keyboard, scroll actions
 */
async function runLlmActions(
  actions: LlmAction[],
  context: {
    workflowRec?: WorkflowRecord;
    getIsTabActive: () => boolean;
    runWorkflowTaskStep: (
      workflowRecord: WorkflowRecord,
      additionalPrompt?: string,
    ) => Promise<void>;
  },
): Promise<boolean> {
  console.log('runLlmActions called with', actions.length, 'actions', context);
  // TODO: Implement action execution
  // This stub returns true to allow the code to compile
  return true;
}

let isTabActive = false;
window.addEventListener('focus', (e) => {
  isTabActive = true;
});
window.addEventListener('blur', (e) => {
  isTabActive = false;
});

// let sessionRunner: ReturnType<typeof callLLMSession>;

async function runWorkflowTaskStep(
  workflowRecord: WorkflowRecord,
  additionalPrompt?: string,
) {
  const taskIndex = workflowRecord.taskIndex ?? 0;
  const stepIndex = workflowRecord.stepIndex ?? 0;
  const task = workflowRecord.workflow.tasks[taskIndex];
  const step = task.steps[stepIndex];
  console.log('runWorkflow', taskIndex, stepIndex);

  // Build prompt using the executor's prompt transformer
  const promptTransformer = defaultExecutor.promptTransformer(
    workflowRecord.argWithKey,
  );
  const stepPrompt = additionalPrompt
    ? `${step.prompt}\n${additionalPrompt}`
    : step.prompt;
  const prompt = promptTransformer(stepPrompt);
  console.log('prompt', step.prompt, additionalPrompt, prompt);
  await runWithLLM(prompt, workflowRecord);
}

const runWorkflow = async (workflowRecordOrPrompt: WorkflowRecord | string) => {
  console.log('runWorkflow', workflowRecordOrPrompt);
  if (typeof workflowRecordOrPrompt === 'object') {
    if (!workflowRecordOrPrompt.isTabActive === undefined) {
      return;
    }
    isTabActive = workflowRecordOrPrompt.isTabActive!;
    return runWorkflowTaskStep(workflowRecordOrPrompt);
  }
  // Use the new roles-based executor for string prompts
  const result = await defaultExecutor
    .newSession()
    .newPrompt(workflowRecordOrPrompt);
  console.log('run', result);
};

// const callLLMSession = (systemPrompt: string) => {
//   return queryLLMSession(systemPrompt);
// };

export default runWorkflow;
