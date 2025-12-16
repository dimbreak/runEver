import { X } from 'lucide-react';
import { memo, ReactNode, useCallback } from 'react';
import type { DragEvent } from 'react';
import { cn } from '../utils/cn';
import { useTabStore } from '../state/tabStore';
import { webviewService } from '../services/webviewService';

type TabItemProps = {
  tabId: string;
  label: ReactNode;
  isActive: boolean;
};

export const TabItem = memo(function TabItem({
  tabId,
  label,
  isActive,
}: TabItemProps) {
  const { reorderTabs, setActiveTab, closeTab, frameMap } = useTabStore();

  const handleTabClick = useCallback(
    () => setActiveTab(tabId),
    [setActiveTab, tabId],
  );

  const handleCloseTab = useCallback(async () => {
    const frameId = frameMap.get(tabId);
    await webviewService.closeTab({ frameId: frameId ?? undefined });
    closeTab(tabId);
  }, [closeTab, frameMap, tabId]);

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!tabId) return;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', tabId);
    },
    [tabId],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!tabId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    [tabId],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!tabId) return;
      event.preventDefault();
      const sourceId = event.dataTransfer.getData('text/plain');
      if (!sourceId || sourceId === tabId) return;
      reorderTabs(sourceId, tabId);
    },
    [tabId, reorderTabs],
  );

  const handleDragEnd = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer?.clearData();
  }, []);

  return (
    <li className={cn('shrink-0', { 'sticky left-0 z-10': isActive })}>
      <div
        className={cn(
          'flex items-center gap-2 h-10 pl-3 pr-2 rounded-lg text-sm font-semibold transition-colors border',
          {
            'bg-white text-slate-900 border-slate-200 shadow-sm': isActive,
            'text-slate-600 border-transparent hover:bg-slate-100': !isActive,
          },
        )}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      >
        <button
          type="button"
          onClick={handleTabClick}
          className="flex items-center gap-2"
        >
          {label}
        </button>
        <button
          type="button"
          onClick={handleCloseTab}
          className="rounded-md p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          aria-label="Close tab"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
});
