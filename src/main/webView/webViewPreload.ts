import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { ToMianIpc } from '../../contracts/toMain';
import { ToWebView } from '../../contracts/toWebView';

const electronHandler = {
  ipcRenderer: {
    invoke(channel: string, ...args: any[]) {
      return ipcRenderer.invoke(channel, ...args);
    },
    send(channel: string, ...args: any[]) {
      return ipcRenderer.send(channel, ...args);
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

window.electron = electronHandler;

window.onload = async () => {
  const handleFrameId = (event: MessageEvent) => {
    if (event.data.frameId) {
      window.frameId = event.data.frameId;
      ToMianIpc.bindFrameId.invoke({
        id: event.data.frameId,
      });
      console.log('Setting frameId in preload:', event.data.frameId);
      window.removeEventListener('message', handleFrameId);
    }
  };
  window.addEventListener('message', handleFrameId);

  ToWebView.RunPrompt.webviewHandle(async (request) => {
    console.log('RunPrompt', request);
    return {
      response: 'hihi',
    };
  });

  // await new Promise((resolve) => setTimeout(resolve, 1000));
  // const ocrRes = await OCRModel.getFromScreenshot();
  // console.log('OCR preload screenshot response:', ocrRes);
};
