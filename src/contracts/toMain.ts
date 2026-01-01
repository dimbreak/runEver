import type {
  Rectangle,
  MouseInputEvent,
  MouseWheelInputEvent,
  KeyboardInputEvent,
} from 'electron';
import { IpcMainContract } from './ipc';
import { LlmApi } from '../main/llm/api';

export type MouseWheelScrollInputEvent = MouseWheelInputEvent & {
  scrollEl: string;
};
export type EventWithDelay = (
  | MouseInputEvent
  | MouseWheelScrollInputEvent
  | KeyboardInputEvent
) & { delayMs?: number };

export namespace ToMainIpc {
  export const createTab = new IpcMainContract<
    [{ url: string; bounds?: Rectangle }],
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
        ttlHeight: number;
        ttlWidth: number;
        vpHeight: number;
        vpWidth: number;
        slices: { x: number; y: number }[];
      },
    ],
    { error: string } | Buffer[]
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
      },
    ],
    { error?: string }
  >('run-prompt');
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
