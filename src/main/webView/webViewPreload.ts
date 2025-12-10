import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { OCRModel } from '../../injection/ocr';

const electronHandler = {
  ipcRenderer: {
    invoke(channel: string, ...args: any[]) {
      return ipcRenderer.invoke(channel, ...args);
    },
    on(
      channel: string,
      func: (_event: IpcRendererEvent, ...args: any[]) => void,
    ) {
      ipcRenderer.on(channel, func);

      return () => {
        ipcRenderer.removeListener(channel, func);
      };
    },
    once(
      channel: string,
      func: (_event: IpcRendererEvent, ...args: any[]) => void,
    ) {
      ipcRenderer.once(channel, func);
    },
    postMessage(message: any) {
      postMessage(message, '*');
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;

window.electron = electronHandler;

window.onload = async () => {
  const setFrameId = (event: MessageEvent) => {
    if (event.data.frameId) {
      console.log('Setting frameId in preload:', event.data.frameId);
      window.frameId = event.data.frameId;
      window.removeEventListener('message', setFrameId);
    }
  };
  window.addEventListener('message', setFrameId);
  const res = await window.electron.ipcRenderer.invoke(
    'ocr-preload-loaded',
    'ping',
  );
  console.log('OCR preload loaded response:', res);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  OCRModel.showInteractiveOverlay();
  OCRModel.takeScreenshot();
};
