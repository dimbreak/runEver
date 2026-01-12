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
    <div className="flex items-center">
      <Button
        type="button"
        onClick={handleAddTab}
        variant="outline"
        className="flex items-center gap-1"
        size="md"
      >
        <Plus className="w-4 h-4" /> New Tab
      </Button>
      <Button
        type="button"
        onClick={async () => {
          const newTab = new WebTab({
            id: `tab-${Date.now()}`,
            title: 'Mark App',
            url: 'about:runEverMark',
          });
          addTab(newTab, bounds);
          toggleUrlBar(true);
        }}
        variant="outline"
        className="flex items-center gap-1 ml-2"
        size="md"
      >
        Open App
      </Button>
    </div>
  );
});
