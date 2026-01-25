import { IcpRendererContract } from './ipc';

export namespace ToRendererIpc {
  export const toUser = new IcpRendererContract<
    [
      | {
          type: 'info' | 'warning' | 'error' | 'confirm';
          message: string;
        }
      | {
          responseId: number;
          type: 'prompt';
          message: string;
          questions: Record<
            string,
            | {
                type: 'string';
              }
            | {
                type: 'select';
                options: string[];
              }
          >;
        },
    ]
  >('to-user');
  export const promptResponse = new IcpRendererContract<
    [
      {
        requestId: number;
        chunk: string;
      },
    ]
  >('prompt-response');
  export const llmSessionSnapshot = new IcpRendererContract<
    [
      {
        frameId: number;
        snapshot: unknown | null;
      },
    ]
  >('llm-session-snapshot');
  export const authDeepLink = new IcpRendererContract<
    [
      {
        url: string;
      },
    ]
  >('auth-deeplink');
  export const tab = new IcpRendererContract<
    [
      {
        tabId: number | -1;
        url?: string;
        actionId?: number; // if from llm action
        triggerFrameId?: number; // if from llm action
      },
    ]
  >('tab');
}
