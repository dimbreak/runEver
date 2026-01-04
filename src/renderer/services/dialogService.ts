import { ToMainIpc } from '../../contracts/toMain';

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

type PromptQuestions = Record<
  string,
  | {
      type: 'string';
    }
  | {
      type: 'select';
      options: string[];
    }
>;

const hasIpc = () =>
  typeof window !== 'undefined' &&
  Boolean((window as any).electron?.ipcRenderer);

export const dialogService = {
  hasBridge: hasIpc,

  async showSystemMessageBox(opts: SystemMessageBoxOptions) {
    if (!hasIpc()) throw new Error('IPC bridge not available');
    const res = await ToMainIpc.showSystemMessageBox.invoke(opts);
    if ('response' in res) return res.response;
    throw new Error(res.error ?? 'Failed to open system dialog');
  },

  async openBrowserWindowDialog(opts: BrowserWindowDialogOptions) {
    if (!hasIpc()) throw new Error('IPC bridge not available');
    const res = await ToMainIpc.openBrowserWindowDialog.invoke(opts);
    if ('result' in res) return res.result;
    throw new Error(res.error ?? 'Failed to open BrowserWindow dialog');
  },

  async promptInput(opts: {
    title?: string;
    message: string;
    questions: PromptQuestions;
    okText?: string;
    cancelText?: string;
  }) {
    if (!hasIpc()) throw new Error('IPC bridge not available');
    const res = await ToMainIpc.openPromptInputDialog.invoke({
      title: opts.title,
      message: opts.message,
      questions: opts.questions,
      okText: opts.okText,
      cancelText: opts.cancelText,
    });
    if ('error' in res) throw new Error(res.error ?? 'Failed to open dialog');
    if (res.result !== 'ok') return null;
    return res.answer ?? {};
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
