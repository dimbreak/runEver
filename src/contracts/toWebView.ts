import { IcpRendererContract, IpcWebViewContract } from './ipc';
import { LlmModelType, ReasoningEffort } from '../webView/llm';

export const ToWebView = {
  RunPrompt: new IpcWebViewContract<
    [
      number,
      {
        prompt: string;
        reasoningEffort?: ReasoningEffort;
        cacheKey?: string;
        systemPrompt?: string;
        modelType?: LlmModelType;
        requestId: number;
        stream?: boolean;
        args?: Record<string, string>;
      },
    ],
    { response: any }
  >('run-prompt'),
};
