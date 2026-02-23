import { X } from 'lucide-react';
import { memo, ReactNode, useCallback, useState } from 'react';
import type { DragEvent } from 'react';
import { cn } from '../utils/cn';
import { useTabStore } from '../state/tabStore';
import { useLayoutStore } from '../state/layoutStore';

type TabItemProps = {
  tabId: number;
  label: ReactNode;
  isActive: boolean;
};

export const TabItem = memo(function TabItem({
  tabId,
  label,
  isActive,
}: TabItemProps) {
  const { reorderTabs, setActiveTab, closeTab, tabs } = useTabStore();
  const { toggleUrlBar } = useLayoutStore();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleTabClick = useCallback(() => {
    setActiveTab(tabId);
    toggleUrlBar(true);
  }, [setActiveTab, tabId, toggleUrlBar]);

  const handleCloseTab = useCallback(async () => {
    await closeTab(tabId);
    if (tabs.length === 1) {
      toggleUrlBar(false);
    }
  }, [closeTab, tabs, tabId, toggleUrlBar]);

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!tabId) return;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', tabId.toString());
    },
    [tabId],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!tabId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    },
    [tabId],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!tabId) return;
      event.preventDefault();
      const sourceId = parseInt(event.dataTransfer.getData('text/plain'), 10);
      if (Number.isNaN(sourceId) || sourceId === tabId) return;
      reorderTabs(sourceId, tabId);
      setIsDragOver(false);
    },
    [tabId, reorderTabs],
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDragEnd = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer?.clearData();
    setIsDragOver(false);
  }, []);

  return (
    <li
      className={cn('shrink-0', {
        'sticky left-0 z-10 max-w-75 overflow-hidden': isActive,
      })}
    >
      <div
        className={cn(
          'relative flex h-8 w-full items-center gap-1 truncate rounded-lg border text-sm font-semibold transition-colors',
          {
            'border-slate-200 bg-white text-slate-900 shadow-sm': isActive,
            'border-transparent text-slate-600 hover:bg-slate-100': !isActive,
            'border-blue-300 bg-blue-50/70 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.45)]':
              isDragOver,
          },
        )}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragLeave={handleDragLeave}
        onDragEnd={handleDragEnd}
      >
        {isDragOver && (
          <span
            className="absolute top-2 bottom-2 left-[-6px] w-[3px] rounded-full bg-blue-500/80 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
            aria-hidden
          />
        )}

        <button
          type="button"
          onClick={handleTabClick}
          className={cn(
            'w-full truncate pl-2',
            'inline-flex h-full flex-1 items-center gap-1 rounded-lg text-left',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
          )}
          aria-label={`Tab: ${typeof label === 'string' ? label : 'Untitled'}`}
          aria-selected={isActive}
          role="tab"
        >
          {label}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleCloseTab();
          }}
          className="mr-1 rounded-md p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          aria-label={`Close tab: ${typeof label === 'string' ? label : 'Untitled'}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
});
