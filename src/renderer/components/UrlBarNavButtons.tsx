import * as React from 'react';
import { Button } from './ui/button';
import type { WebTab } from '../state/tabStore';

type UrlBarNavButtonsProps = {
  tab: WebTab | null;
  url?: string | null;
};

export const UrlBarNavButtons: React.FC<UrlBarNavButtonsProps> = ({
  tab,
  url,
}) => {
  const [canGoBack, setCanGoBack] = React.useState(false);
  const [canGoForward, setCanGoForward] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!tab) return;
    const state = await tab.getNavigationState();
    if (!state) return;
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
  }, [tab]);

  React.useEffect(() => {
    refresh();
  }, [refresh, url]);

  const handleBack = React.useCallback(async () => {
    if (!tab) return;
    const state = await tab.goBack();
    if (state) {
      setCanGoBack(state.canGoBack);
      setCanGoForward(state.canGoForward);
      return;
    }
    await refresh();
  }, [refresh, tab]);

  const handleForward = React.useCallback(async () => {
    if (!tab) return;
    const state = await tab.goForward();
    if (state) {
      setCanGoBack(state.canGoBack);
      setCanGoForward(state.canGoForward);
      return;
    }
    await refresh();
  }, [refresh, tab]);

  return (
    <>
      <Button
        type="button"
        onClick={handleBack}
        disabled={!canGoBack}
        size="sm"
        variant="outline"
        className="shrink-0"
        title="Back"
      >
        ←
      </Button>
      <Button
        type="button"
        onClick={handleForward}
        disabled={!canGoForward}
        size="sm"
        variant="outline"
        className="shrink-0"
        title="Forward"
      >
        →
      </Button>
    </>
  );
};

