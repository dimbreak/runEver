import { IcpRendererContract } from './ipc';
import { TaskSnapshot } from '../schema/taskSnapshot';
import { type SessionStatus } from '../agentic/session';

export namespace ToRendererIpc {
  export type ToUserMessage =
    | {
        type: 'info' | 'warning' | 'error' | 'confirm';
        message: string;
        sessionId: number;
      }
    | {
        responseId: number;
        sessionId: number;
        type: 'prompt';
        title?: string;
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
      }
    | {
        responseId: number;
        sessionId: number;
        type: 'snapshot';
        snapshot: TaskSnapshot;
      };
  export const toUser = new IcpRendererContract<[ToUserMessage]>('to-user');
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
  export const sessionsUpdate = new IcpRendererContract<
    [Record<number, SessionStatus>]
  >('sessions-update');
}
