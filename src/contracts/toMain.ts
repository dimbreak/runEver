import type {
  Rectangle,
  MouseInputEvent,
  MouseWheelInputEvent,
  KeyboardInputEvent,
} from 'electron';
import { IpcMainContract } from './ipc';
import { WireAction } from '../injection/roles/system/executor.schema';

export type LlmConfig = { error?: string; api: 'openai'; key: string };
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
    LlmConfig
  >('get-llm-config');
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
  export const setActions = new IpcMainContract<
    [
      {
        frameId: number;
        actions: WireAction[];
        args: Record<string, string>;
      },
    ],
    boolean
  >('set-actions');
  export const popAction = new IpcMainContract<
    [
      {
        frameId: number;
        completed?: number;
        args: Record<string, string>;
      },
    ],
    boolean
  >('pop-action');
}
