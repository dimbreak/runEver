import { memo, ReactNode, useRef, useState, useEffect } from 'react';
import { cn } from '../utils/cn';

interface TabListProps {
  children: ReactNode;
}

export const TabList = memo(function TabList({ children }: TabListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      const element = listRef.current;
      if (!element) return;

      const isOverflowing = element.scrollWidth > element.clientWidth;
      setHasOverflow(isOverflowing);
    };

    checkOverflow();

    const timeoutId = setTimeout(checkOverflow, 100);

    return () => clearTimeout(timeoutId);
  }, [children]);

  return (
    <ul
      ref={listRef}
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-2',
        '[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]',
        {
          'scroll-shadows': hasOverflow,
        },
      )}
    >
      {children}
    </ul>
  );
});
