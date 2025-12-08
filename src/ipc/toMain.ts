import type { Rectangle } from 'electron';
import { IcpMainContract } from './ipc';

export const ToMianIpc = {
  createTab: new IcpMainContract<
    [{ url: string; bounds: Rectangle }],
    { id: string } | { error: string }
  >('create-tab'),
  operateTab: new IcpMainContract<
    [
      {
        id: string;
        bounds?: Rectangle;
        url?: string;
        exeScript?: string;
        close?: boolean;
        visible?: boolean;
      },
    ],
    { error: string } | { response: any }
  >('operate-tab'),
};
