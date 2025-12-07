import { SquareTerminal } from 'lucide-react';
import * as React from 'react';
import { useCallback } from 'react';

export type TabContent = {
  title: string;
  id: string;
} & {
  type: 'webview';
  url: string;
  isRunning?: boolean;
};

export type TabConfig = {
  currentTabIndex: number;
  tabs: TabContent[];
};

export const TabBar: React.FC<{
  tabConfig: TabConfig;
  setTabConfig: React.Dispatch<React.SetStateAction<TabConfig>>;
}> = ({ tabConfig, setTabConfig }) => {
  const handleTabClick = useCallback(
    (currentTabIndex: number) => () =>
      setTabConfig((s) => ({ ...s, currentTabIndex })),
    [setTabConfig],
  );
  return (
    <ul id="tab-bar">
      <li className={tabConfig.currentTabIndex === -1 ? 'active' : ''}>
        <a href="#" onClick={handleTabClick(-1)}>
          <SquareTerminal />
        </a>
      </li>
      {tabConfig.tabs.map((tab, index) => (
        <li
          key={tab.id}
          className={tabConfig.currentTabIndex === index ? 'active' : ''}
        >
          <a href="#" onClick={handleTabClick(index)}>
            {tab.title}
          </a>
        </li>
      ))}
    </ul>
  );
};
