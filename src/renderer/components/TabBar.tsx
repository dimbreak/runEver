import { SquareTerminal } from 'lucide-react';
import * as React from 'react';
import { useCallback } from 'react';
import { useLayoutStore } from '../state/layoutStore';

const baseTab =
  'flex items-center gap-2 h-10 px-3 rounded-lg text-sm font-semibold transition-colors border';

const activeTab = 'bg-white text-slate-900 border-slate-200 shadow-sm';

const inactiveTab = 'text-slate-600 border-transparent hover:bg-slate-100';

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
    <ul className="flex w-full items-center gap-2 px-3">
      <li>
        <button
          type="button"
          onClick={handleTabClick(-1)}
          className={`${baseTab} ${
            tabConfig.currentTabIndex === -1 ? activeTab : inactiveTab
          }`}
        >
          <SquareTerminal className="w-5 h-5" />
        </button>
      </li>
      {tabConfig.tabs.map((tab, index) => (
        <li key={tab.id}>
          <button
            type="button"
            onClick={handleTabClick(index)}
            className={`${baseTab} ${
              tabConfig.currentTabIndex === index ? activeTab : inactiveTab
            }`}
          >
            {tab.title}
          </button>
        </li>
      ))}
      <li className="ml-auto">
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
