import { ToMianIpc } from '../../contracts/toMain';

type SystemMessageBoxOptions = {
  title?: string;
  message: string;
  detail?: string;
  type?: 'none' | 'info' | 'error' | 'question' | 'warning';
  buttons?: string[];
};

type BrowserWindowDialogOptions = {
  title?: string;
  message?: string;
};

const hasIpc = () =>
  typeof window !== 'undefined' &&
  Boolean((window as any).electron?.ipcRenderer);

export const dialogService = {
  hasBridge: hasIpc,

  async showSystemMessageBox(opts: SystemMessageBoxOptions) {
    if (!hasIpc()) throw new Error('IPC bridge not available');
    const res = await ToMianIpc.showSystemMessageBox.invoke(opts);
    if ('response' in res) return res.response;
    throw new Error(res.error ?? 'Failed to open system dialog');
  },

  async openBrowserWindowDialog(opts: BrowserWindowDialogOptions) {
    if (!hasIpc()) throw new Error('IPC bridge not available');
    const res = await ToMianIpc.openBrowserWindowDialog.invoke(opts);
    if ('result' in res) return res.result;
    throw new Error(res.error ?? 'Failed to open BrowserWindow dialog');
  },

  async confirm(opts: {
    title?: string;
    message: string;
    detail?: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'none' | 'info' | 'error' | 'question' | 'warning';
  }) {
    const response = await dialogService.showSystemMessageBox({
      title: opts.title,
      message: opts.message,
      detail: opts.detail,
      type: opts.type ?? 'question',
      buttons: [opts.confirmText ?? 'OK', opts.cancelText ?? 'Cancel'],
    });
    return response === 0;
  },
};

