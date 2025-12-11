import { SquareTerminal } from 'lucide-react';
import * as React from 'react';
import { useCallback } from 'react';
import { useLayoutStore } from '../state/layoutStore';

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
  const { toggleSidebar } = useLayoutStore();
  const handleTabClick = useCallback(
    (currentTabIndex: number) => () =>
      setTabConfig((s) => ({ ...s, currentTabIndex })),
    [setTabConfig],
  );
  return (
    <ul id="tab-bar" style={{ display: 'flex', alignItems: 'center' }}>
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
      <li style={{ marginLeft: 'auto' }}>
        <button
          type="button"
          onClick={toggleSidebar}
          className="bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-semibold px-3 py-1.5 rounded-md transition-colors border border-blue-500"
        >
          Open Agent
        </button>
      </li>
    </ul>
  );
};
