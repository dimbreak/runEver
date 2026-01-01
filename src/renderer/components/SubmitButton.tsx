import * as React from 'react';
import { cn } from '../utils/cn';

export type SubmitButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

export function SubmitButton({
  onClick,
  disabled,
  className,
}: SubmitButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-lg shadow-sky-200/60 transition',
        'bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50',
        disabled && 'opacity-50',
        className,
      )}
    >
      <span className="text-sm font-bold">Go</span>
    </button>
  );
}
