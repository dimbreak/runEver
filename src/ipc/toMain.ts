import type { Rectangle } from 'electron';
import { IpcMainContract } from './ipc';

export const ToMianIpc = {
  createTab: new IpcMainContract<
    [{ url: string; bounds: Rectangle }],
    { id: number } | { error: string }
  >('create-tab'),
  operateTab: new IpcMainContract<
    [
      {
        id: number;
        bounds?: Rectangle;
        url?: string;
        exeScript?: string;
        close?: boolean;
        visible?: boolean;
      },
    ],
    { error: string } | { response: any }
  >('operate-tab'),
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
};
