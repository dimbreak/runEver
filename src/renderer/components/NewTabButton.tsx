import { Plus } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTabStore, WebTab } from '../state/tabStore';
import { Button } from './ui/button';
import { useLayoutStore } from '../state/layoutStore';

export const NewTabButton = memo(function NewTabButton() {
  const { addTab } = useTabStore();
  const { bounds, toggleUrlBar } = useLayoutStore();
  const handleAddTab = useCallback(() => {
    const newTab = new WebTab({
      id: -1,
      title: 'New Tab',
      url: '',
    });
    addTab(newTab, bounds);
    toggleUrlBar(true);
  }, [addTab, bounds, toggleUrlBar]);
  return (
    <div className="flex items-center">
      <Button
        type="button"
        onClick={handleAddTab}
        variant="ghost"
        className="flex items-center justify-center px-1 lg:px-2"
        size="sm"
        title="New Tab"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
});
