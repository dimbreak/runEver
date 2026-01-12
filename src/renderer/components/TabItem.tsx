import { X } from 'lucide-react';
import { memo, ReactNode, useCallback, useState } from 'react';
import type { DragEvent } from 'react';
import { cn } from '../utils/cn';
import { useTabStore } from '../state/tabStore';
import { useLayoutStore } from '../state/layoutStore';

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
  const { toggleUrlBar } = useLayoutStore();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleTabClick = useCallback(() => {
    setActiveTab(tabId);
    toggleUrlBar(true);
  }, [setActiveTab, tabId, toggleUrlBar]);

  const handleCloseTab = useCallback(async () => {
    await closeTab(tabId);
    if (frameMap.size === 1) {
      toggleUrlBar(false);
    }
  }, [closeTab, frameMap, tabId, toggleUrlBar]);

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
      setIsDragOver(true);
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
          'w-full h-10 relative flex items-center gap-2 rounded-lg text-sm font-semibold transition-colors border truncate',
          {
            'bg-white text-slate-900 border-slate-200 shadow-sm': isActive,
            'text-slate-600 border-transparent hover:bg-slate-100': !isActive,
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
            className="absolute left-[-6px] top-2 bottom-2 w-[3px] rounded-full bg-blue-500/80 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
            aria-hidden
          />
        )}

        <button
          type="button"
          onClick={handleTabClick}
          className={cn(
            'w-full pl-3 pr-2 truncate',
            'flex items-center gap-2 flex-1 h-full text-left rounded-lg',
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
          className="rounded-md p-1 mr-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          aria-label={`Close tab: ${typeof label === 'string' ? label : 'Untitled'}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
});
