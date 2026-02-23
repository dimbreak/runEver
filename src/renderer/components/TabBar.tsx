import * as React from 'react';
import { useMemo, useCallback } from 'react';
import { Bot, Settings } from 'lucide-react';
import { useIpcListeners } from '../hooks/useIpcListeners';
import { useWebviewManagerHook } from '../hooks/useWebviewManagerHook';
import { useLayoutStore } from '../state/layoutStore';
import { useTabStore, WebTab } from '../state/tabStore';
import { NewTabButton } from './NewTabButton';
import { TabItem } from './TabItem';
import { TabList } from './TabList';
import { Button } from './ui/button';
import { UrlBar } from './UrlBar';

export const TabBar: React.FC = () => {
  const { toggleSidebar, isSidebarOpen, bounds, toggleUrlBar } =
    useLayoutStore();
  const { tabs, activeTabId, addTab } = useTabStore();
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const orderedTabs = useMemo(() => tabs, [tabs]);

  const handleOpenConfig = useCallback(() => {
    const newTab = new WebTab({
      id: -1,
      title: 'Config',
      url: 'runever://config',
    });
    addTab(newTab, bounds);
    toggleUrlBar(true);
  }, [addTab, bounds, toggleUrlBar]);

  useIpcListeners();

  useWebviewManagerHook();

  return (
    <div className="flex h-full w-full flex-col gap-1 px-2 pt-1">
      <div className="flex w-full items-center gap-1">
        <div className="flex max-w-[calc(100%-100px)] shrink items-center overflow-hidden">
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
        </div>
        <NewTabButton />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            onClick={handleOpenConfig}
            size="sm"
            variant="outline"
          >
            <Settings size={16} />
          </Button>
          {!isSidebarOpen && (
            <Button type="button" onClick={toggleSidebar} size="sm">
              <Bot size={16} />
            </Button>
          )}
        </div>
      </div>
      {activeTab && <UrlBar url={activeTab.url} tab={activeTab} />}
    </div>
  );
};
