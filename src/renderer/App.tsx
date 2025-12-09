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
    const createTab = async () => {
      try {
        const tabRes = await ToMianIpc.createTab.invoke({
          url: 'http://www.google.com',
          bounds: { x: 100, y: 10, width: 200, height: 200 },
        });

        await ToMianIpc.operateTab.invoke({
          id: (tabRes as { id: string }).id,
          bounds: { x: 0, y: 50, width: 600, height: 600 },
          exeScript: 'alert("Hello from tab!");',
        });
      } catch (error) {
        console.error(error);
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
