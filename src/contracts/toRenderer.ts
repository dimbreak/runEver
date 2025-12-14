import { IcpRendererContract } from './ipc';

export const ToRendererIpc = {
  ToUser: new IcpRendererContract<
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
  >('to-user'),
};
