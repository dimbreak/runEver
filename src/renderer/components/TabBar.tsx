import * as React from 'react';
import { useMemo } from 'react';
import { useIpcListeners } from '../hooks/useIpcListeners';
import { useWebviewManager } from '../hooks/useWebviewManager';
import { useLayoutStore } from '../state/layoutStore';
import { useTabStore } from '../state/tabStore';
import { NewTabButton } from './NewTabButton';
import { TabItem } from './TabItem';
import { TabList } from './TabList';
import { Button } from './ui/button';
import { UrlBar } from './UrlBar';

export const TabBar: React.FC = () => {
  const { toggleSidebar } = useLayoutStore();
  const { tabs, activeTabId } = useTabStore();
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const orderedTabs = useMemo(() => tabs, [tabs]);

  useIpcListeners();

  useWebviewManager();

  return (
    <div className="flex h-full w-full flex-col gap-2 px-3 pt-2">
      <div className="flex w-full items-center gap-2">
        <TabList>
          {orderedTabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            return (
              <TabItem
                key={tab.id}
                tabId={tab.id}
                label={tab.title}
                isActive={isActive}
              />
            );
          })}
        </TabList>
        <div className="flex items-center gap-2 shrink-0">
          <NewTabButton />
          <Button type="button" onClick={toggleSidebar} size="sm">
            Open Agent
          </Button>
        </div>
      </div>
      {activeTab && <UrlBar url={activeTab.url} />}
    </div>
  );
};
