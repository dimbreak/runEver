import type {
  Rectangle,
  MouseInputEvent,
  MouseWheelInputEvent,
  KeyboardInputEvent,
} from 'electron';
import { IpcMainContract } from './ipc';
import { LlmApi } from '../main/llm/api';
import type { PromptAttachment } from '../schema/attachments';
import { IframeProgressType } from '../extensions/iframe/types';

export type EventWithDelay = (
  | MouseInputEvent
  | MouseWheelInputEvent
  | KeyboardInputEvent
) & { delayMs?: number };

export namespace ToMainIpc {
  export const createTab = new IpcMainContract<
    [{ url: string; bounds?: Rectangle; parentFrameId?: number }],
    { id: number } | { error: string }
  >('create-tab');
  export const operateTab = new IpcMainContract<
    [
      {
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
    [{ id: number; scrollAdjustment?: number }],
    { error?: string } | void
  >('bind-frame-id');
  export const takeScreenshot = new IpcMainContract<
    [
      {
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
  export const getLlmConfig = new IpcMainContract<
    [number], // frameId
    LlmApi.LlmConfig
  >('get-llm-config');
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
    [{ answer: Record<string, string>; id: number }],
    undefined
  >('response-prompt-input');
  export const dispatchEvents = new IpcMainContract<
    [
      {
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
        frameId: number;
        input: string;
      },
    ],
    boolean
  >('paste-input');
  export const actionDone = new IpcMainContract<
    [
      {
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
        frameId: number;
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
        frameId: number;
        requestId?: number;
      },
    ],
    { stopped: boolean; error?: string }
  >('stop-prompt');
  export const getTabNavigationState = new IpcMainContract<
    [
      {
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
  export const getLlmSessionSnapshot = new IpcMainContract<
    [
      {
        frameId: number;
      },
    ],
    { snapshot: unknown } | { error: string }
  >('get-llm-session-snapshot');
  export const navigateTabHistory = new IpcMainContract<
    [
      {
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
        frameId: number;
        url: string;
        filename?: string;
      },
    ],
    { error?: string }
  >('download');
  export const auditAction = new IpcMainContract<
    [
      {
        frameId: number;
        actionId: number;
        html: string;
        selector: string;
        screenshotRect: Rectangle;
        extraInfo: Record<string, string>;
      },
    ],
    {
      approved: boolean;
      error: string | null;
    }
  >('audit-action');
}
