import type { Rectangle } from 'electron';
import { IpcMainContract } from './ipc';

export type LlmConfig = { error?: string; api: 'openai'; key: string };

export const ToMianIpc = {
  createTab: new IpcMainContract<
    [{ url: string; bounds?: Rectangle }],
    { id: number } | { error: string }
  >('create-tab'),
  operateTab: new IpcMainContract<
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
  >('operate-tab'),
  bindFrameId: new IpcMainContract<[{ id: number }], { error?: string } | void>(
    'bind-frame-id',
  ),
  takeScreenshot: new IpcMainContract<
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
  >('take-screenshot'),
  getLlmConfig: new IpcMainContract<
    [number], // frameId
    LlmConfig
  >('get-llm-config'),
  responsePromptInput: new IpcMainContract<
    [{ answer: Record<string, string>; id: number }],
    undefined
  >('response-prompt-input'),
};
