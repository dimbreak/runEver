import './App.css';
import { useEffect, useState } from 'react';
import { TabBar, TabConfig } from './components/TabBar';
import { HomeScreen } from './view/HomeScreen';
import { ToMianIpc } from '../ipc/toMain';

export default function App() {
  const [tabConfig, setTabConfig] = useState<TabConfig>({
    currentTabIndex: -1,
    tabs: [
      {
        id: 'tab-1',
        title: 'Google',
        type: 'webview',
        url: 'https://www.google.com',
        isRunning: true,
      },
      {
        id: 'tab-2',
        title: 'OpenAI',
        type: 'webview',
        url: 'https://www.openai.com',
      },
    ],
  });
  useEffect(() => {
    // Listen for IPC example events
    window.electron.ipcRenderer.on('ipc-example', (_event, args) => {
      console.log('ipc-example event received with args:', args);
    });

    // Create and operate on a tab using async/await pattern
    const createTab = async () => {
      try {
        const tabRes = await ToMianIpc.createTab.invoke({
          url: 'http://www.google.com',
          bounds: { x: 100, y: 10, width: 200, height: 200 },
        });

        console.log('Tab create res:', tabRes);

        if ('id' in tabRes) {
          const operateRes = await ToMianIpc.operateTab.invoke({
            id: tabRes.id,
            bounds: { x: 0, y: 50, width: 600, height: 600 },
            exeScript: 'alert("Hello from tab!");',
          });

          console.log('Tab operate res:', operateRes);

          // expose latest tab info for other components (e.g., AgentPanel screenshot)
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          window.lastFrameId = tabRes.id;
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          window.lastTabBounds = { width: 600, height: 600 };
        }
      } catch (error) {
        console.error('Error creating or operating tab:', error);
      }
    };

    createTab();
  }, []);
  return (
    <>
      <TabBar tabConfig={tabConfig} setTabConfig={setTabConfig} />
      <div id="body-placeholder">
        <div className={tabConfig.currentTabIndex === -1 ? '' : 'hide'}>
          <HomeScreen />
        </div>
      </div>
    </>
  );
}
