import type { Rectangle } from 'electron';
import { IpcMainContract } from './ipc';
import { RunEverConfig } from '../main/runeverConfigStore';

type setConfigReq<K extends keyof RunEverConfig = keyof RunEverConfig> = {
  frameId: number;
  key: K;
  config: RunEverConfig[K];
};

type getConfigApi<K extends keyof RunEverConfig = keyof RunEverConfig> =
  IpcMainContract<
    [
      {
        frameId: number;
        key: K;
      },
    ],
    { config: RunEverConfig[K] } | { error: string }
  >;

export namespace ToRuneverIpc {
  export const setConfig = new IpcMainContract<
    [setConfigReq],
    { error?: string }
  >('set-config');
  export const getConfig: getConfigApi = new IpcMainContract('get-config');
}
