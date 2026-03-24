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

const CONFIG_ROOT_URL = 'runever://config';
const CONFIG_APIKEY_URL = 'runever://config/apikey';

const isConfigUrl = (url?: string | null) => url?.startsWith(CONFIG_ROOT_URL);

type TabBarProps = {
  hasApiConfig: boolean;
  onAgentButtonClick: () => Promise<boolean>;
};

export const TabBar: React.FC<TabBarProps> = ({
  hasApiConfig,
  onAgentButtonClick,
}) => {
  const { toggleSidebar, isSidebarOpen, bounds, toggleUrlBar } =
    useLayoutStore();
  const { tabs, activeTabId, addTab, setActiveTab, navigateTab } = useTabStore();
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const orderedTabs = useMemo(() => tabs, [tabs]);

  const focusOrCreateConfigTab = useCallback(
    async (targetUrl: string, navigateWhenActive: boolean) => {
      if (activeTab && isConfigUrl(activeTab.url)) {
        if (navigateWhenActive && activeTab.url !== targetUrl) {
          await navigateTab(activeTab.id, targetUrl);
        }
        toggleUrlBar(true);
        return;
      }

      const existingConfigTab = tabs.find((tab) => isConfigUrl(tab.url));
      if (existingConfigTab) {
        await setActiveTab(existingConfigTab.id);
        if (existingConfigTab.url !== targetUrl) {
          await navigateTab(existingConfigTab.id, targetUrl);
        }
        toggleUrlBar(true);
        return;
      }

      const newTab = new WebTab({
        id: -1,
        title: 'Config',
        url: targetUrl,
      });
      await addTab(newTab, bounds);
      toggleUrlBar(true);
    },
    [activeTab, addTab, bounds, navigateTab, setActiveTab, tabs, toggleUrlBar],
  );

  const handleOpenConfig = useCallback(async () => {
    if (activeTab?.url === CONFIG_ROOT_URL) {
      return;
    }

    await focusOrCreateConfigTab(CONFIG_ROOT_URL, false);
  }, [activeTab?.url, focusOrCreateConfigTab]);

  const handleOpenAgent = useCallback(async () => {
    if (!hasApiConfig) {
      await focusOrCreateConfigTab(CONFIG_APIKEY_URL, true);
      return;
    }

    const configured = await onAgentButtonClick();
    if (configured) {
      toggleSidebar();
    } else {
      await focusOrCreateConfigTab(CONFIG_APIKEY_URL, true);
    }
  }, [
    focusOrCreateConfigTab,
    hasApiConfig,
    onAgentButtonClick,
    toggleSidebar,
  ]);

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
          {(!isSidebarOpen || !hasApiConfig) && (
            <Button type="button" onClick={handleOpenAgent} size="sm">
              <Bot size={16} />
            </Button>
          )}
        </div>
      </div>
      {activeTab && <UrlBar url={activeTab.url} tab={activeTab} />}
    </div>
  );
};
