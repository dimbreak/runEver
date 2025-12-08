import './App.css';
import { useState } from 'react';
import { TabBar, TabConfig } from './components/TabBar';
import { HomeScreen } from './view/HomeScreen';

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
