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

export type PromptQuestions = Record<
  string,
  | {
      type: 'string';
    }
  | {
      type: 'select';
      options: string[];
    }
>;

export type PromptInputDialogOptions = {
  title?: string;
  message: string;
  questions: PromptQuestions;
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

export async function openPromptInputDialog(
  mainWindow: BrowserWindow,
  opts: PromptInputDialogOptions,
): Promise<
  | { result: 'ok' | 'cancel' | 'closed'; answer?: Record<string, string> }
  | { error: string }
> {
  try {
    return await new Promise<{
      result: 'ok' | 'cancel' | 'closed';
      answer?: Record<string, string>;
    }>((resolve) => {
      let resolved = false;
      const resolveOnce = (result: 'ok' | 'cancel' | 'closed', answer?: any) => {
        if (resolved) return;
        resolved = true;
        resolve({ result, answer });
      };

      const dialogWindow = new BrowserWindow({
        parent: mainWindow,
        modal: true,
        show: false,
        width: opts.width ?? 520,
        height: opts.height ?? 420,
        resizable: true,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        backgroundColor: '#0b1220',
        title: opts.title ?? 'Input Required',
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          devTools: false,
        },
      });

      const closeWithResult = (
        result: 'ok' | 'cancel' | 'closed',
        answer?: Record<string, string>,
      ) => {
        resolveOnce(result, answer);
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
          const answerParam = parsed.searchParams.get('answer');
          let answer: Record<string, string> | undefined;
          if (answerParam) {
            try {
              answer = JSON.parse(decodeURIComponent(answerParam));
            } catch {
              answer = undefined;
            }
          }
          if (result === 'ok' || result === 'cancel') {
            closeWithResult(result, answer);
          } else {
            closeWithResult('closed');
          }
        } catch {
          // ignore invalid URLs
        }
      });

      const title = escapeHtml(opts.title ?? 'Input Required');
      const message = escapeHtml(opts.message);
      const okText = escapeHtml(opts.okText ?? 'OK');
      const cancelText = escapeHtml(opts.cancelText ?? 'Cancel');

      const fields = Object.entries(opts.questions).map(([key, question]) => {
        const label = escapeHtml(key);
        if (question.type === 'select') {
          const options = question.options
            .map(
              (opt) =>
                `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`,
            )
            .join('');
          return `<label class="field">
  <span>${label}</span>
  <select name="${label}">${options}</select>
</label>`;
        }
        return `<label class="field">
  <span>${label}</span>
  <input name="${label}" type="text" />
</label>`;
      });

      const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;"
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
      form { display: flex; flex-direction: column; gap: 10px; overflow: auto; }
      .field { display: flex; flex-direction: column; gap: 6px; }
      .field span { font-size: 12px; color: #cbd5e1; }
      input, select {
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.25);
        background: rgba(148, 163, 184, 0.08);
        color: #e2e8f0;
        outline: none;
        font-size: 13px;
      }
      .row { display: flex; gap: 10px; justify-content: flex-end; margin-top: auto; }
      button {
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
      button.primary {
        background: #1893ff;
        border-color: rgba(24, 147, 255, 0.65);
      }
      button:hover { filter: brightness(1.06); }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>${title}</h1>
      <p>${message}</p>
      <form id="form">
        ${fields.join('\n')}
      </form>
      <div class="row">
        <button type="button" id="cancel">${cancelText}</button>
        <button type="submit" form="form" class="primary">${okText}</button>
      </div>
    </div>
    <script>
      const form = document.getElementById('form');
      const cancel = document.getElementById('cancel');
      cancel.addEventListener('click', () => {
        location.href = 'flowaway-dialog://close?result=cancel';
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const obj = {};
        for (const [k, v] of data.entries()) {
          obj[k] = String(v ?? '');
        }
        location.href =
          'flowaway-dialog://close?result=ok&answer=' +
          encodeURIComponent(JSON.stringify(obj));
      });
    </script>
  </body>
</html>`;

      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      dialogWindow.loadURL(dataUrl).catch(() => closeWithResult('closed'));
      dialogWindow.webContents.once('did-finish-load', () => {
        if (!dialogWindow.isDestroyed()) dialogWindow.show();
      });
    });
  } catch (err) {
    return { error: (err as Error).message };
  }
}
