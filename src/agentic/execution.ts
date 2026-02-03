import fs from 'fs/promises';
import {
  type ExecutorLlmResult,
  ExecutorLlmResultSchema,
  RiskOrComplexityLevel,
  WireActionWithWait,
  WireActionWithWaitSchema,
} from './execution.schema';
import { LlmApi } from './api';
import {
  JsonStreamingEvent,
  JsonStreamingEventType,
  JsonStreamingParser,
} from '../main/llm/jsonStreamer';
import { Profile } from './profile/profile';
import './profile/registry';
import { WebViewLlmSession } from './webviewLlmSession';
import { taskHeader } from './prompts/header';
import { getExecutorSys } from './prompts/executorSys';

const ComplexityToModelConfig: Record<
  RiskOrComplexityLevel,
  [LlmApi.LlmModelType, LlmApi.ReasoningEffort]
> = {
  l: ['mid', 'low'],
  m: ['mid', 'medium'],
  h: ['mid', 'medium'],
};

interface ExecutorOptions {
  requireScreenshot?: boolean;
  complexity?: RiskOrComplexityLevel;
  extraAttachments?: string[];
  focusElement?: string;
  smartAction?: string;
}

export class ExecutionPrompter {
  runner: Promise<ReturnType<typeof LlmApi.queryLLMSession>> | undefined;
  requestInSession = 0;
  header = taskHeader;
  systemPrompt = getExecutorSys();
  constructor(private tabManager: WebViewLlmSession) {}
  getRunner() {
    console.info('getRunner', this.runner);
    if (!this.runner) {
      // delta too long, reset system prompt
      this.runner = new Promise(async (resolve) => {
        console.log('Executor runner init');
        resolve(LlmApi.queryLLMSession('', 'executor_'));
      });
      console.info('this.runner:', this.runner);
    }
    return this.runner;
  }
  async *execPrompt(
    goalPrompt: string,
    args: Record<string, string> = {},
    subPrompt: string | undefined = undefined,
    opts: ExecutorOptions = {},
    retry = 0,
  ): AsyncGenerator<WireActionWithWait, ExecutorLlmResult | undefined, void> {
    const {
      complexity = 'l',
      requireScreenshot = false,
      extraAttachments = [],
    } = opts;
    const { tabManager } = this;
    const tab = tabManager.getFocusedTab()!;
    const { webView: wv } = tab;
    const rect = wv.getBounds();
    console.log('Executor execPrompt', wv.webContents.id);
    const fullHtml = (await wv.webContents.executeJavaScript(
      'window.webView.getHtml()',
    )) as string;
    const runner = await this.getRunner();
    const readableFiles = Array.from(tabManager.readableFiles.keys());
    const modelCfg = ComplexityToModelConfig[complexity];
    const promptParts = await Profile.process(
      'execution',
      {
        goal: goalPrompt,
        sub: subPrompt,
        system: this.systemPrompt,
        userHeader: `[url]
${wv.webContents.getURL()}${
          tabManager.tabsCount() > 1
            ? `

[opened tabs]
${tabManager
  .listTabs()
  .map(
    (t) =>
      `${t.id}:${t.title ? `[${t.title}] ${t.url}` : t.url}${t.focused ? ' focus' : ''}`,
  )
  .join('\n')}`
            : ''
        }

[viewport]
w=${rect.width} h=${rect.height}

[html]
${fullHtml}${
          readableFiles.length
            ? `

[readable file]
- ${Array.from(tabManager.readableFiles.values()).map(
                (k) =>
                  `${extraAttachments.includes(k.name) ? 'attached ' : ''}${k.name}: ${k.mimeType}${k.desc ? ` desc from previous read:${k.desc}` : ''}`,
              ).join(`
- `)}
**can attach with todo.readFiles, note read file is expensive attach when necessary**`
            : ''
        }

[argument keys]
${
  args && Object.keys(args).length
    ? Object.entries(args)
        .map((arg) => `${arg[0]}: ${arg[1]}`)
        .join('\n')
    : '(no keys)'
}`,
      },
      wv.webContents,
    );
    const runPrompt = `${taskHeader}

${promptParts.userHeader}

[goal]
${promptParts.goal}${promptParts.sub ? `\n\n${promptParts.sub}` : ''}`;
    const attachments: LlmApi.Attachment[] = [];
    if (requireScreenshot) {
      attachments.push({
        type: 'image',
        image: (await tab.screenshot()).toJPEG(80),
        mediaType: 'image/jpeg',
      });
    }
    if (extraAttachments.length) {
      for (const f of extraAttachments) {
        const file = tabManager.readableFiles.get(f);
        if (file) {
          if (!file.data) {
            try {
              file.data = await fs.readFile(file.path!);
            } catch (e) {
              console.error('Failed to read file', file.path, e);
            }
          }
          if (file.data) {
            if (file.mimeType.startsWith('image/')) {
              attachments.push({
                type: 'image',
                image: file.data,
                mediaType: file.mimeType,
              });
            } else {
              attachments.push({
                type: 'file',
                data: file.data,
                mediaType: file.mimeType,
              });
            }
          }
        }
      }
    }
    console.log(
      '------------------------------------------\nExecutor runner prompt:',
      `${promptParts.userHeader}

[goal]
${promptParts.goal}${promptParts.sub ? `\n[mission]\n${promptParts.sub}` : ''}`,
    );
    let actionStage = 0;
    let events: JsonStreamingEvent[];
    let event: JsonStreamingEvent;
    let hasError = false;
    let parsedReturn;
    const jsonParser = new JsonStreamingParser(true);
    try {
      const stream = runner(
        runPrompt,
        attachments,
        modelCfg[0],
        modelCfg[1],
        promptParts.system,
      );
      this.requestInSession++;
      for await (const chunk of stream) {
        events = jsonParser.push(chunk);
        if (!hasError) {
          for (event of events) {
            if (event.type === JsonStreamingEventType.Error) {
              console.error('parse error', event);
              hasError = true;
              break;
            }
            if (event.type === JsonStreamingEventType.Array) {
              if (event.key === 'a') {
                actionStage++;
              }
            } else if (
              event.type === JsonStreamingEventType.Object &&
              event.endValue
            ) {
              if (
                actionStage === 1 &&
                typeof event.key === 'number' &&
                event.endValue.intent
              ) {
                const step = WireActionWithWaitSchema.safeParse(event.endValue);
                if (step.success) {
                  yield step.data;
                } else {
                  console.warn('Exec step error:', step.error, event.endValue);
                }
              } else if (event.key === null) {
                console.log('Exec result end');
                parsedReturn = event.endValue;
              }
            }
          }
        }
      }
      if (parsedReturn === undefined) {
        const endRes = jsonParser.readAll();
        console.log('Exec end no result', endRes);
        parsedReturn = JSON.parse(endRes);
      }
    } catch (e) {
      console.log('Exec error', e);
    }
    const jsonRes = ExecutorLlmResultSchema.safeParse(parsedReturn ?? {});
    console.log('Exec result:', jsonRes);
    if (jsonRes.success) {
      return jsonRes.data;
    }
    console.log('Retry execPrompt', parsedReturn, retry);
    if (actionStage === 0 && retry < 3) {
      return yield* this.execPrompt(
        goalPrompt,
        args,
        subPrompt,
        {
          requireScreenshot,
          complexity,
          extraAttachments,
        },
        retry + 1,
      );
    }
    throw new Error(
      `Exec end error ${JSON.stringify(parsedReturn)}:${JSON.stringify(
        jsonRes.error,
      )}`,
    );
  }
}
