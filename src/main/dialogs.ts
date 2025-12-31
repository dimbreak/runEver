import { BrowserWindow, dialog } from 'electron';

export type SystemMessageBoxOptions = {
  title?: string;
  message: string;
  detail?: string;
  type?: 'none' | 'info' | 'error' | 'question' | 'warning';
  buttons?: string[];
};

export async function showSystemMessageBox(
  mainWindow: BrowserWindow,
  opts: SystemMessageBoxOptions,
): Promise<{ response: number } | { error: string }> {
  try {
    const buttons = opts.buttons?.length ? opts.buttons : ['OK', 'Cancel'];
    const res = await dialog.showMessageBox(mainWindow, {
      type: opts.type ?? 'info',
      title: opts.title ?? 'System Dialog',
      message: opts.message,
      detail: opts.detail,
      buttons,
      defaultId: 0,
      cancelId: Math.max(0, buttons.length - 1),
      noLink: true,
    });
    return { response: res.response };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export type BrowserWindowDialogOptions = {
  title?: string;
  message?: string;
  okText?: string;
  cancelText?: string;
  width?: number;
  height?: number;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#039;';
      default:
        return char;
    }
  });

export async function openBrowserWindowDialog(
  mainWindow: BrowserWindow,
  opts: BrowserWindowDialogOptions,
): Promise<{ result: 'ok' | 'cancel' | 'closed' } | { error: string }> {
  try {
    return await new Promise<{ result: 'ok' | 'cancel' | 'closed' }>(
      (resolve) => {
        let resolved = false;
        const resolveOnce = (result: 'ok' | 'cancel' | 'closed') => {
          if (resolved) return;
          resolved = true;
          resolve({ result });
        };

        const dialogWindow = new BrowserWindow({
          parent: mainWindow,
          modal: true,
          show: false,
          width: opts.width ?? 420,
          height: opts.height ?? 260,
          resizable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          backgroundColor: '#0b1220',
          title: opts.title ?? 'BrowserWindow Dialog',
          webPreferences: {
            contextIsolation: true,
            sandbox: true,
            devTools: false,
          },
        });

        const closeWithResult = (result: 'ok' | 'cancel' | 'closed') => {
          resolveOnce(result);
          if (!dialogWindow.isDestroyed()) {
            dialogWindow.close();
          }
        };

        dialogWindow.on('closed', () => closeWithResult('closed'));

        dialogWindow.webContents.on('will-navigate', (event, url) => {
          try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'flowaway-dialog:') return;
            event.preventDefault();
            const result = parsed.searchParams.get('result');
            if (result === 'ok' || result === 'cancel') {
              closeWithResult(result);
            } else {
              closeWithResult('closed');
            }
          } catch {
            // ignore invalid URLs
          }
        });

        const title = escapeHtml(opts.title ?? 'BrowserWindow Dialog');
        const message = escapeHtml(
          opts.message ?? 'This modal is rendered by a BrowserWindow.',
        );
        const okText = escapeHtml(opts.okText ?? 'OK');
        const cancelText = escapeHtml(opts.cancelText ?? 'Cancel');

        const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
          Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        background: #0b1220;
        color: #e2e8f0;
        height: 100vh;
      }
      .container {
        height: 100%;
        box-sizing: border-box;
        padding: 18px 18px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      h1 { font-size: 14px; margin: 0; color: #f8fafc; }
      p { font-size: 13px; margin: 0; color: #cbd5e1; line-height: 1.5; }
      .row { display: flex; gap: 10px; justify-content: flex-end; margin-top: auto; }
      a.btn {
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        appearance: none;
        border: 1px solid rgba(148, 163, 184, 0.25);
        background: rgba(148, 163, 184, 0.1);
        color: #e2e8f0;
        font-weight: 700;
        font-size: 12px;
        border-radius: 12px;
        padding: 10px 12px;
        cursor: pointer;
      }
      a.btn.primary {
        background: #1893ff;
        border-color: rgba(24, 147, 255, 0.65);
      }
      a.btn:hover { filter: brightness(1.06); }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>${title}</h1>
      <p>${message}</p>
      <div class="row">
        <a class="btn" href="flowaway-dialog://close?result=cancel">${cancelText}</a>
        <a class="btn primary" href="flowaway-dialog://close?result=ok">${okText}</a>
      </div>
    </div>
  </body>
</html>`;

        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
        dialogWindow.loadURL(dataUrl).catch(() => closeWithResult('closed'));
        dialogWindow.webContents.once('did-finish-load', () => {
          if (!dialogWindow.isDestroyed()) dialogWindow.show();
        });
      },
    );
  } catch (err) {
    return { error: (err as Error).message };
  }
}

