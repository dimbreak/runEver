import * as React from 'react';
import { Button } from './ui/button';
import { useTabStore, type WebTab } from '../state/tabStore';

type UrlBarNavButtonsProps = {
  tab: WebTab | null;
  url?: string | null;
};

export const UrlBarNavButtons: React.FC<UrlBarNavButtonsProps> = ({
  tab,
  url,
}) => {
  const sessionId = useTabStore((state) => state.sessionId);
  const [canGoBack, setCanGoBack] = React.useState(false);
  const [canGoForward, setCanGoForward] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!tab) return;
    try {
      const state = await tab.getNavigationStateForSession(sessionId);
      if (!state) return;
      setCanGoBack(state.canGoBack);
      setCanGoForward(state.canGoForward);
    } catch (error) {
      console.error(error);
      setCanGoBack(false);
      setCanGoForward(false);
    }
  }, [sessionId, tab]);

  React.useEffect(() => {
    refresh();
  }, [refresh, url]);

  const handleBack = React.useCallback(async () => {
    if (!tab) return;
    try {
      const state = await tab.goBack(sessionId);
      if (state) {
        setCanGoBack(state.canGoBack);
        setCanGoForward(state.canGoForward);
        return;
      }
    } catch (error) {
      console.error(error);
    }
    await refresh();
  }, [refresh, sessionId, tab]);

  const handleForward = React.useCallback(async () => {
    if (!tab) return;
    try {
      const state = await tab.goForward(sessionId);
      if (state) {
        setCanGoBack(state.canGoBack);
        setCanGoForward(state.canGoForward);
        return;
      }
    } catch (error) {
      console.error(error);
    }
    await refresh();
  }, [refresh, sessionId, tab]);

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
