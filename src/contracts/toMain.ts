import type {
  KeyboardInputEvent,
  MouseInputEvent,
  MouseWheelInputEvent,
  Rectangle,
} from 'electron';
import { IframeProgressType } from '../extensions/iframe/types';
import { LlmApi } from '../main/llm/api';
import type { PromptAttachment } from '../schema/attachments';
import type { AuthMode } from '../schema/auth.schema';
import type { Env } from '../schema/env.schema';
import { IpcMainContract } from './ipc';
import { type SessionStatus } from '../agentic/session';

export type EventWithDelay = (
  | MouseInputEvent
  | MouseWheelInputEvent
  | KeyboardInputEvent
) & { delayMs?: number };

export namespace ToMainIpc {
  export const createTab = new IpcMainContract<
    [
      {
        sessionId: number;
        url: string;
        bounds?: Rectangle;
        parentFrameId?: number;
      },
    ],
    { id: number } | { error: string }
  >('create-tab');
  export const operateTab = new IpcMainContract<
    [
      {
        sessionId: number;
        id: number;
        bounds?: Rectangle;
        url?: string;
        viewportWidth?: number;
        exeScript?: string;
        close?: boolean;
        visible?: boolean;
        sidebarWidth?: number;
        tabbarHeight?: number;
      },
    ],
    { error: string } | { response: any }
  >('operate-tab');
  export const bindFrameId = new IpcMainContract<
    [{ sessionId?: number; frameId: number; scrollAdjustment?: number }],
    { error?: string } | void
  >('bind-frame-id');
  export const takeScreenshot = new IpcMainContract<
    [
      {
        sessionId: number;
        frameId: number;
        x?: number;
        y?: number;
        height: number;
        width: number;
        vpHeight: number;
        vpWidth: number;
        filename?: string;
      },
    ],
    { error: string } | Buffer
  >('take-screenshot');
  export const getUserAuthState = new IpcMainContract<
    [],
    {
      hasApiKey: boolean;
      provider: Env['provider'] | null;
      authMode: AuthMode | null;
    }
  >('get-user-auth-state');
  export const setUserApiKey = new IpcMainContract<
    [
      {
        provider: Env['provider'];
        apiKey: string;
        baseUrl?: string;
      },
    ],
    void
  >('set-user-api-key');
  export const clearUserApiKey = new IpcMainContract<[], void>(
    'clear-user-api-key',
  );
  export const setAuthMode = new IpcMainContract<
    [
      {
        mode: AuthMode | null;
      },
    ],
    void
  >('set-auth-mode');
  export const showSystemMessageBox = new IpcMainContract<
    [
      {
        title?: string;
        message: string;
        detail?: string;
        type?: 'none' | 'info' | 'error' | 'question' | 'warning';
        buttons?: string[];
      },
    ],
    { response: number } | { error: string }
  >('show-system-message-box');
  export const openBrowserWindowDialog = new IpcMainContract<
    [
      {
        title?: string;
        message?: string;
      },
    ],
    { result: 'ok' | 'cancel' | 'closed' } | { error: string }
  >('open-browserwindow-dialog');
  export const openPromptInputDialog = new IpcMainContract<
    [
      {
        sessionId?: number;
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
        okText?: string;
        cancelText?: string;
      },
    ],
    | {
        result: 'ok' | 'cancel' | 'closed';
        answer?: Record<string, string>;
      }
    | { error: string }
  >('open-prompt-input-dialog');
  export const responsePromptInput = new IpcMainContract<
    [{ sessionId?: number; answer: Record<string, string> | null; id: number }],
    undefined
  >('response-prompt-input');
  export const dispatchEvents = new IpcMainContract<
    [
      {
        sessionId?: number;
        frameId: number;
        events: EventWithDelay[];
      },
    ],
    boolean
  >('dispatch-events');
  export type NativeKeys =
    | 'ArrowDown'
    | 'ArrowUp'
    | 'ArrowLeft'
    | 'ArrowRight'
    | 'Enter'
    | 'Tab'
    | 'Space'
    | 'Escape'
    | string;
  export const dispatchNativeKeypress = new IpcMainContract<
    [
      {
        keyAndDelays: [NativeKeys, number][];
      },
    ],
    boolean
  >('dispatch-native-keypress');
  export const pasteInput = new IpcMainContract<
    [
      {
        sessionId?: number;
        frameId: number;
        input: string;
      },
    ],
    boolean
  >('paste-input');
  export const actionDone = new IpcMainContract<
    [
      {
        sessionId?: number;
        frameId: number;
        actionId: number;
        argsDelta?: Record<string, string>;
        iframeId?: string;
      },
    ],
    boolean
  >('action-done');
  export const actionError = new IpcMainContract<
    [
      {
        sessionId?: number;
        frameId: number;
        actionId: number;
        error: string;
        iframeId?: string;
      },
    ],
    boolean
  >('action-error');
  export const runPrompt = new IpcMainContract<
    [
      {
        sessionId: number;
        prompt: string;
        reasoningEffort?: LlmApi.ReasoningEffort;
        modelType?: LlmApi.LlmModelType;
        requestId: number;
        streamReturn?: boolean;
        args?: Record<string, string>;
        attachments?: PromptAttachment[];
      },
    ],
    { error?: string }
  >('run-prompt');
  export const setInputFile = new IpcMainContract<
    [
      {
        sessionId?: number;
        frameId: number;
        selector: string;
        filePaths: string[];
      },
    ],
    { error?: string }
  >('set-input-file');
  export const stopPrompt = new IpcMainContract<
    [
      {
        sessionId: number;
        requestId?: number;
      },
    ],
    { stopped: boolean; error?: string }
  >('stop-prompt');
  export const getTabNavigationState = new IpcMainContract<
    [
      {
        sessionId?: number;
        frameId: number;
      },
    ],
    | {
        canGoBack: boolean;
        canGoForward: boolean;
        url: string;
      }
    | { error: string }
  >('get-tab-navigation-state');
  export const getApiTrustEnv = new IpcMainContract<
    [],
    {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      apiUrl: string;
    }
  >('get-apitrust-env');
  export const getApiTrustToken = new IpcMainContract<
    [],
    {
      token: string | null;
    }
  >('get-apitrust-token');
  export const getPendingAuthDeepLink = new IpcMainContract<
    [],
    {
      url: string | null;
    }
  >('get-pending-auth-deeplink');
  export const clearPendingAuthDeepLink = new IpcMainContract<[], void>(
    'clear-pending-auth-deeplink',
  );
  export const setApiTrustToken = new IpcMainContract<
    [
      {
        token: string | null;
      },
    ],
    void
  >('set-apitrust-token');
  export const openApiTrustAuthWindow = new IpcMainContract<
    [
      {
        url: string;
      },
    ],
    void
  >('open-apitrust-auth-window');
  export const navigateTabHistory = new IpcMainContract<
    [
      {
        sessionId?: number;
        frameId: number;
        direction: 'back' | 'forward';
      },
    ],
    | {
        canGoBack: boolean;
        canGoForward: boolean;
        url: string;
      }
    | { error: string }
  >('navigate-tab-history');
  export const iframeProgress = new IpcMainContract<
    [
      {
        sessionId?: number;
        frameId: number;
        iframeId: string;
        type: IframeProgressType;
      },
    ],
    { error?: string }
  >('iframe-progress');
  export const download = new IpcMainContract<
    [
      {
        sessionId?: number;
        frameId: number;
        url: string;
        filename?: string;
      },
    ],
    { error?: string }
  >('download');
  export const newSession = new IpcMainContract<
    [number], // current sessionId to get window
    { id?: number; error?: string }
  >('new-session');
  export const closeSession = new IpcMainContract<
    [number], // sessionId
    { error?: string }
  >('close-session');
  // export const auditAction = new IpcMainContract<
  //   [
  //     {
  //       frameId: number;
  //       actionId: number;
  //       html: string;
  //       selector: string;
  //       screenshotRect: Rectangle;
  //       extraInfo: Record<string, string>;
  //     },
  //   ],
  //   {
  //     approved: boolean;
  //     error: string | null;
  //   }
  // >('audit-action');
}
