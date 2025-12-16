import { X } from 'lucide-react';
import { memo } from 'react';
import { cn } from '../utils/cn';

type TabItemProps = {
  label: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  onClose?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
};

export const TabItem: React.FC<TabItemProps> = memo(
  ({
    label,
    isActive,
    onClick,
    onClose,
    draggable = false,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
  }) => (
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
          onClick={onClick}
          className="flex items-center gap-2"
        >
          {label}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            aria-label="Close tab"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </li>
  ),
);
