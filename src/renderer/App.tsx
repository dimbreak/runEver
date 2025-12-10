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
    window.electron.ipcRenderer.on('ipc-example', (_event, args) => {
      console.log('ipc-example event received with args:', args);
    });
    ToMianIpc.createTab
      .invoke({
        url: 'http://www.google.com',
        bounds: { x: 100, y: 10, width: 200, height: 200 },
      })
      .then((res) => {
        console.log('Tab create res:', res);
        ToMianIpc.operateTab
          .invoke({
            id: res.id,
            bounds: { x: 100, y: 10, width: 400, height: 400 },
            exeScript: '1+1;',
          })
          .then((res) => {
            console.log('Tab operate res:', res);
          });
      });
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
