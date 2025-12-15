import { Plus, SquareTerminal, X } from 'lucide-react';
import * as React from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useLayoutStore } from '../state/layoutStore';
import { useTabStore, WebTab } from '../state/tabStore';
import { webviewService } from '../services/webviewService';
import { Input } from './ui/input';
import { Button } from './ui/button';

const BASE_TAB_CLASS =
  'flex items-center gap-2 h-10 pl-3 pr-2 rounded-lg text-sm font-semibold transition-colors border';

const ACTIVE_TAB_CLASS = 'bg-white text-slate-900 border-slate-200 shadow-sm';

const INACTIVE_TAB_CLASS =
  'text-slate-600 border-transparent hover:bg-slate-100';

const normalizeUrlValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  return hasProtocol ? trimmed : `https://${trimmed}`;
};

const urlSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, '請輸入網址')
    .transform((val) => normalizeUrlValue(val)),
});

type UrlFormValues = z.infer<typeof urlSchema>;

const computeBounds = (
  isSidebarOpen: boolean,
  sidebarWidth: number,
  collapsedWidth: number,
  tabbarHeight: number,
) => {
  const padding = 12;
  const activeSidebarWidth = isSidebarOpen ? sidebarWidth : collapsedWidth;
  const width = Math.max(
    320,
    window.innerWidth - activeSidebarWidth - padding * 2,
  );
  const height = Math.max(320, window.innerHeight - tabbarHeight - padding * 2);
  return { x: padding, y: tabbarHeight + padding, width, height };
};

export const TabBar: React.FC = () => {
  const {
    toggleSidebar,
    sidebarWidth,
    collapsedWidth,
    tabbarHeight,
    isSidebarOpen,
    setTabbarHeight,
  } = useLayoutStore();
  const {
    tabs,
    activeTabId,
    setActiveTab,
    addTab,
    closeTab,
    frameMap,
    registerFrameId,
    removeFrameId,
    updateTabUrl,
  } = useTabStore();

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );

  const form = useForm<UrlFormValues>({
    resolver: zodResolver(urlSchema),
    defaultValues: { url: activeTab?.url ?? '' },
  });
  const { handleSubmit, register, formState, reset, setValue } = form;

  useEffect(() => {
    reset({ url: activeTab?.url ?? '' });
  }, [activeTab, reset]);

  useEffect(() => {
    // Keep webview layout bounds in sync with the actual bar height.
    const expandedHeight = 112;
    const collapsedHeight = 72;
    setTabbarHeight(activeTab ? expandedHeight : collapsedHeight);
  }, [activeTab, setTabbarHeight]);

  const handleTabClick = useCallback(
    (id: string | null) => () => setActiveTab(id),
    [setActiveTab],
  );

  const handleCloseTab = useCallback(
    (id: string) => async () => {
      const frameId = frameMap.get(id);
      await webviewService.closeTab({ frameId: frameId ?? undefined });
      closeTab(id);
    },
    [closeTab, frameMap],
  );

  const handleAddTab = useCallback(() => {
    const newTab = new WebTab({
      id: `tab-${Date.now()}`,
      title: 'New Tab',
      url: 'https://www.google.com',
    });
    addTab(newTab);
  }, [addTab]);

  const orderedTabs = useMemo(() => tabs, [tabs]);

  const handleUrlSubmit = useCallback(
    async (data: UrlFormValues) => {
      if (!activeTabId) return;
      const nextUrl = data.url;
      if (!nextUrl) return;
      updateTabUrl(activeTabId, nextUrl);
      setValue('url', nextUrl, { shouldValidate: false });
      const frameId = frameMap.get(activeTabId);
      if (frameId) {
        await webviewService.layoutTab({
          frameId,
          url: nextUrl,
        });
      }
    },
    [activeTabId, frameMap, setValue, updateTabUrl],
  );

  // Manage all webviews here to avoid duplicate creations.
  useEffect(() => {
    if (!webviewService.hasBridge()) return () => {};

    const syncTabs = async () => {
      const bounds = computeBounds(
        isSidebarOpen,
        sidebarWidth,
        collapsedWidth,
        tabbarHeight,
      );

      // Close removed tabs/webviews
      const toClose = Array.from(frameMap.entries()).filter(
        ([tabId]) => !tabs.find((t) => t.id === tabId),
      );
      if (toClose.length) {
        await Promise.all(
          toClose.map(async ([tabId, frameId]) => {
            if (!frameId) return;
            await webviewService.closeTab({ frameId });
            removeFrameId(tabId);
          }),
        );
      }

      // Create missing and layout all
      const layoutTasks = tabs.map(async (tab) => {
        let frameId = frameMap.get(tab.id);
        if (!frameId) {
          frameId = await webviewService.createTab({
            url: tab.url,
            bounds,
          });
          if (!frameId) return;
          registerFrameId(tab.id, frameId);
        }
        const isActive = activeTabId === tab.id;
        await webviewService.layoutTab({
          frameId,
          visible: isActive,
          sidebarWidth: isSidebarOpen ? sidebarWidth : collapsedWidth,
          tabbarHeight,
          bounds,
        });
      });
      await Promise.all(layoutTasks);
    };

    syncTabs();
    window.addEventListener('resize', syncTabs);
    return () => {
      window.removeEventListener('resize', syncTabs);
    };
  }, [
    activeTabId,
    collapsedWidth,
    frameMap,
    isSidebarOpen,
    registerFrameId,
    removeFrameId,
    sidebarWidth,
    tabbarHeight,
    tabs,
  ]);

  return (
    <div className="flex h-full w-full flex-col gap-2 px-3 py-2 pb-3">
      <div className="flex w-full items-center gap-2">
        <ul className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-2">
          <li
            className={`flex-shrink-0 ${
              activeTabId === null ? 'sticky left-0 z-10' : ''
            }`}
          >
            <Button
              type="button"
              onClick={handleTabClick(null)}
              variant="ghost"
              className={`${BASE_TAB_CLASS} ${
                activeTabId === null ? ACTIVE_TAB_CLASS : INACTIVE_TAB_CLASS
              }`}
              title="Home"
            >
              <SquareTerminal className="w-5 h-5" />
            </Button>
          </li>
          {orderedTabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            return (
              <li
                key={tab.id}
                className={`flex-shrink-0 ${isActive ? 'sticky left-0 z-10' : ''}`}
              >
                <div
                  className={`${BASE_TAB_CLASS} ${
                    isActive ? ACTIVE_TAB_CLASS : INACTIVE_TAB_CLASS
                  }`}
                >
                  <button
                    type="button"
                    onClick={handleTabClick(tab.id)}
                    className="flex items-center gap-2"
                  >
                    {tab.title}
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseTab(tab.id)}
                    className="rounded-md p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                    aria-label={`Close ${tab.title}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            type="button"
            onClick={handleAddTab}
            variant="outline"
            className="flex items-center gap-1"
            size="md"
          >
            <Plus className="w-4 h-4" /> New Tab
          </Button>
          <Button type="button" onClick={toggleSidebar} size="sm">
            Open Agent
          </Button>
        </div>
      </div>
      {activeTab && (
        <form
          className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
          onSubmit={handleSubmit(handleUrlSubmit)}
        >
          <Input
            type="text"
            placeholder="Enter a URL or search term"
            className="flex-1"
            {...register('url')}
          />
          <Button type="submit" disabled={formState.isSubmitting} size="sm">
            Go
          </Button>
          {formState.errors.url && (
            <span className="text-[11px] font-medium text-rose-600 px-1">
              {formState.errors.url.message}
            </span>
          )}
        </form>
      )}
    </div>
  );
};
