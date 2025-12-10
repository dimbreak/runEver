import { ToBackgroundMsg, WorkflowRecord } from "./type"
import "./browser-polyfill.js"
import { queryLLMApi, queryLLMSession } from "./llm.js"
import { ExecutorLlmResult } from "./roles/system/executor.schema.js"
import { llmErrorPromptTpl } from "./roles/system/executor"
import { runLlmActions } from "./actions/handlers"
import { defaultExecutor } from "./roles/default"

const indicator = addIndicator()

const MAX_RETRY = 3

let isTabActive = false
addEventListener("focus", (e) => {
  isTabActive = true
})
addEventListener("blur", (e) => {
  isTabActive = false
})

let sessionRunner: ReturnType<typeof callLLMSession>

const runWorkflow = async (workflowRecordOrPrompt: WorkflowRecord | string) => {
  console.log("runWorkflow", workflowRecordOrPrompt)
  if (typeof workflowRecordOrPrompt === "object") {
    isTabActive = workflowRecordOrPrompt.isTabActive
    return runWorkflowTaskStep(workflowRecordOrPrompt)
  } else {
    // Use the new roles-based executor for string prompts
    const result = await defaultExecutor.newSession().newPrompt(workflowRecordOrPrompt)
    console.log("run", result)
  }
}

const runWorkflowTaskStep = async (workflowRecord: WorkflowRecord, additionalPrompt?: string) => {
  const taskIndex = workflowRecord.taskIndex ?? 0
  const stepIndex = workflowRecord.stepIndex ?? 0
  const task = workflowRecord.workflow.tasks[taskIndex]
  const step = task.steps[stepIndex]
  console.log("runWorkflow", taskIndex, stepIndex)

  // Build prompt using the executor's prompt transformer
  const promptTransformer = defaultExecutor.promptTransformer(workflowRecord.argWithKey)
  const stepPrompt = additionalPrompt ? `${step.prompt}\n${additionalPrompt}` : step.prompt
  const prompt = promptTransformer(stepPrompt)
  console.log("prompt", step.prompt, additionalPrompt, prompt)
  await runWithLLM(prompt, workflowRecord)
}

const runWithLLM = async (prompt: string, workflowRecord?: WorkflowRecord) => {
  const llmResult = await callLLMApi(prompt)
  if (llmResult.error) {
    const errorEl = indicator.querySelector("#error")
    if (errorEl) {
      errorEl.innerHTML = llmResult.error
    }
    return
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
}

const MAX_LLM_RETRY_LIMIT = 2

const callLLMSession = (systemPrompt: string) => {
  return queryLLMSession(systemPrompt)
}

const callLLMApi = async (
  prompt: string,
  reasoning: Extract<ToBackgroundMsg, { type: "CALL_LLM" }>["reasoning"] = "low",
  retry = 0
): Promise<ExecutorLlmResult> => {
  const session = defaultExecutor.newSession()
  const systemPrompt = session.systemPrompt
  const stream = queryLLMApi(prompt, systemPrompt, "", reasoning)

  // Collect all parts from the stream
  const parts: string[] = []
  let error: string | undefined
  let eof = false

  for await (const part of stream) {
    if (part.error) {
      error = part.error
      break
    }
    if (part.eof) {
      eof = true
      break
    }
    if (part.part) {
      parts.push(part.part)
    }
  }

  // Check for early return (no key)
  const resultStr = parts.join("")
  if (error || !eof) {
    const errorMsg = error || "NO_RETRY: incomplete response"
    if (errorMsg.startsWith("NO_RETRY")) {
      return {
        actions: [],
        error: errorMsg,
      }
    }
    if (retry < MAX_LLM_RETRY_LIMIT) {
      return await callLLMApi(llmErrorPromptTpl(prompt, errorMsg), reasoning, retry + 1)
    } else {
      return {
        actions: [],
        error: errorMsg,
      }
    }
  }

  // Parse the JSON result
  try {
    const parsed = JSON.parse(resultStr)
    const result = defaultExecutor.parseLLMResult(resultStr)
    if (result.error && !result.error.startsWith("NO_RETRY")) {
      if (retry < MAX_LLM_RETRY_LIMIT) {
        return await callLLMApi(llmErrorPromptTpl(prompt, result.error), reasoning, retry + 1)
      }
    }
    return result
  } catch (e) {
    const parseError = `NO_RETRY: parse error ${String(e)}`
    if (retry < MAX_LLM_RETRY_LIMIT) {
      return await callLLMApi(llmErrorPromptTpl(prompt, parseError), reasoning, retry + 1)
    }
    return {
      actions: [],
      error: parseError,
    }
  }
}

function addIndicator() {
  const indicator = document.createElement("div")
  indicator.id = "indicator"
  indicator.style.position = "fixed"
  indicator.style.top = "0px"
  indicator.style.left = "0px"
  document.body.appendChild(indicator)
  return indicator
}

export default runWorkflow
