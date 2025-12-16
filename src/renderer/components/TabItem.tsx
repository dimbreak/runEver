import { X } from 'lucide-react';
import { memo, ReactNode, useCallback, DragEvent } from 'react';
import { webviewService } from '../services/webviewService';
import { useTabStore } from '../state/tabStore';
import { cn } from '../utils/cn';

type TabItemProps = {
  tabId: string;
  label: ReactNode;
  isActive: boolean;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
};

export const TabItem = memo(function TabItem({
  tabId,
  label,
  isActive,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: TabItemProps) {
  const { frameMap, closeTab, setActiveTab } = useTabStore();
  const handleCloseTab = useCallback(async () => {
    const frameId = frameMap.get(tabId);
    await webviewService.closeTab({ frameId: frameId ?? undefined });
    closeTab(tabId);
  }, [closeTab, frameMap, tabId]);

  const handleTabClick = useCallback(
    () => setActiveTab(tabId),
    [tabId, setActiveTab],
  );
  return (
    <li
      className={cn('shrink-0', { 'sticky left-0 z-10': isActive })}
      draggable={false}
    >
      <div
        className={cn(
          'flex items-center gap-2 h-10 pl-3 pr-2 rounded-lg text-sm font-semibold transition-colors border',
          {
            'bg-white text-slate-900 border-slate-200 shadow-sm': isActive,
            'text-slate-600 border-transparent hover:bg-slate-100': !isActive,
          },
        )}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
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
