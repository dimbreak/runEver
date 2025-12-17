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
      id: `tab-${Date.now()}`,
      title: 'New Tab',
      url: '',
    });
    addTab(newTab, bounds);
    toggleUrlBar(true);
  }, [addTab, bounds, toggleUrlBar]);
  return (
    <Button
      type="button"
      onClick={handleAddTab}
      variant="outline"
      className="flex items-center gap-1"
      size="md"
    >
      <Plus className="w-4 h-4" /> New Tab
    </Button>
  );
});
