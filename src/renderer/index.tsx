import { createRoot } from 'react-dom/client';
import App from './App';
import { ToWebView } from '../contracts/toWebView';

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(<App />);

// calling IPC exposed from preload script
window.electron?.ipcRenderer
  .invoke('ipc-example', ['ping'])
  .then((arg) => {
    console.info(arg);
    setTimeout(() => {
      ToWebView.RunPrompt.invoke(-1, {
        prompt: 'hi',
        requestId: 0,
      })
        .then((res) => console.log('toWebView res:', res))
        .catch(console.error);
    }, 3000);
  })
  .catch((error) => {
    console.error(error);
  });
