import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ToMainIpc, type UrlSuggestionItem } from '../../contracts/toMain';
import { ToRendererIpc } from '../../contracts/toRenderer';
import { applyCtrlEnterUrlValue, normalizeUrlValue } from '../utils/formatter';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useTabStore, WebTab } from '../state/tabStore';
import { UrlBarNavButtons } from './UrlBarNavButtons';

const urlSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, '請輸入網址')
    .transform((val) => normalizeUrlValue(val)),
});

type UrlFormValues = z.infer<typeof urlSchema>;

type UrlBarProps = {
  url?: string | null;
  tab?: WebTab | null;
};

export const UrlBar: React.FC<UrlBarProps> = ({ url = '', tab = null }) => {
  const { activeTabId, navigateTab, sessionId } = useTabStore();
  const [isFocused, setIsFocused] = React.useState(false);
  const [suggestionQuery, setSuggestionQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<UrlSuggestionItem[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const blurTimeoutRef = React.useRef<number | null>(null);
  const deferredSuggestionQuery = React.useDeferredValue(suggestionQuery);
  const { register, handleSubmit, formState, reset, setValue } =
    useForm<UrlFormValues>({
      resolver: zodResolver(urlSchema),
      defaultValues: { url: url ?? '' },
    });
  const {
    ref: inputRef,
    onBlur: formOnBlur,
    onChange: formOnChange,
    name: inputName,
  } = register('url');

  const hideSuggestions = React.useCallback(() => {
    if (sessionId === -1) return;
    ToMainIpc.hideUrlSuggestionsOverlay
      .invoke({ sessionId })
      .catch(console.error);
  }, [sessionId]);

  const clearBlurTimeout = React.useCallback(() => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, []);

  const setInputValue = React.useCallback(
    (nextUrl: string) => {
      setValue('url', nextUrl, {
        shouldDirty: true,
        shouldTouch: true,
      });
    },
    [setValue],
  );

  useEffect(() => {
    reset({ url: url ?? '' });
    setSuggestionQuery('');
    setSuggestions([]);
    setSelectedIndex(-1);
  }, [reset, url]);

  useEffect(() => {
    if (!isFocused || sessionId === -1) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      ToMainIpc.getUrlSuggestions
        .invoke({
          query: deferredSuggestionQuery,
          limit: 10,
        })
        .then((nextSuggestions) => {
          if (cancelled) return undefined;
          setSuggestions(nextSuggestions);
          setSelectedIndex((currentIndex) => {
            if (currentIndex < 0 || nextSuggestions.length === 0) {
              return -1;
            }
            return Math.min(currentIndex, nextSuggestions.length - 1);
          });
          return undefined;
        })
        .catch(console.error);
    }, 40);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferredSuggestionQuery, isFocused, sessionId]);

  useEffect(() => {
    if (!isFocused || sessionId === -1) return;
    ToMainIpc.updateUrlSuggestionsOverlay
      .invoke({
        sessionId,
        suggestions,
        selectedIndex,
      })
      .catch(console.error);
  }, [isFocused, selectedIndex, sessionId, suggestions]);

  useEffect(() => {
    return () => {
      clearBlurTimeout();
      hideSuggestions();
    };
  }, [clearBlurTimeout, hideSuggestions]);

  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    if (!ipc) return undefined;
    const unsubscribe = ipc.on(
      ToRendererIpc.urlSuggestionAction.channel,
      (
        _event,
        payload: { sessionId: number; type: 'navigate'; url: string },
      ) => {
        if (payload.sessionId !== sessionId || payload.type !== 'navigate') {
          return;
        }
        const nextUrl = payload.url;
        clearBlurTimeout();
        setInputValue(nextUrl);
        setSuggestionQuery(nextUrl);
        setSuggestions([]);
        setSelectedIndex(-1);
        setIsFocused(false);
        hideSuggestions();
        if (activeTabId === null || activeTabId === undefined) return;
        navigateTab(activeTabId, nextUrl).catch(console.error);
      },
    );
    return () => {
      unsubscribe?.();
    };
  }, [
    activeTabId,
    clearBlurTimeout,
    hideSuggestions,
    navigateTab,
    sessionId,
    setInputValue,
  ]);

  const submitUrl = React.useCallback(
    async (nextUrl: string) => {
      if (activeTabId === null || activeTabId === undefined || !nextUrl) {
        return;
      }
      clearBlurTimeout();
      await navigateTab(activeTabId, nextUrl);
      reset({ url: nextUrl });
      setIsFocused(false);
      setSuggestionQuery('');
      setSuggestions([]);
      setSelectedIndex(-1);
      hideSuggestions();
    },
    [activeTabId, clearBlurTimeout, hideSuggestions, navigateTab, reset],
  );

  const onFormSubmit = async (data: UrlFormValues) => {
    const nextUrl = data.url;
    if (activeTabId === null || activeTabId === undefined || !nextUrl) return;
    await submitUrl(nextUrl);
  };

  return (
    <form
      className="flex w-full items-center gap-1 rounded-lg border-slate-200 bg-white"
      onSubmit={handleSubmit(onFormSubmit)}
    >
      <UrlBarNavButtons tab={tab} url={url} />
      <Input
        type="text"
        placeholder="Enter a URL or search term"
        className="flex-1 border-none shadow-none focus:border-none focus:ring-0"
        name={inputName}
        ref={inputRef}
        onFocus={(event) => {
          clearBlurTimeout();
          event.target.select();
          setIsFocused(true);
          setSuggestionQuery('');
          setSelectedIndex(-1);
        }}
        onBlur={(event) => {
          Promise.resolve(formOnBlur(event)).catch(() => undefined);
          clearBlurTimeout();
          blurTimeoutRef.current = window.setTimeout(() => {
            setIsFocused(false);
            setSuggestionQuery('');
            setSelectedIndex(-1);
            hideSuggestions();
            blurTimeoutRef.current = null;
          }, 180);
        }}
        onChange={(event) => {
          Promise.resolve(formOnChange(event)).catch(() => undefined);
          if (isFocused) {
            setSuggestionQuery(event.target.value);
            setSelectedIndex(-1);
          }
        }}
        onKeyDown={(event) => {
          if (event.ctrlKey && event.key === 'Enter') {
            event.preventDefault();
            const nextUrl = applyCtrlEnterUrlValue(event.currentTarget.value);
            setInputValue(nextUrl);
            submitUrl(nextUrl).catch(console.error);
            return;
          }
          if (!isFocused || suggestions.length === 0) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            setSelectedIndex((currentIndex) => {
              let nextIndex = currentIndex;
              if (direction === 1) {
                nextIndex =
                  currentIndex < suggestions.length - 1 ? currentIndex + 1 : 0;
              } else {
                nextIndex =
                  currentIndex > 0 ? currentIndex - 1 : suggestions.length - 1;
              }
              const nextUrl = suggestions[nextIndex]?.url;
              if (nextUrl) {
                setInputValue(nextUrl);
              }
              return nextIndex;
            });
          }
        }}
      />
      <Button type="submit" disabled={formState.isSubmitting} size="sm">
        Go
      </Button>
      {formState.errors.url && (
        <span className="px-1 text-[11px] font-medium text-rose-600">
          {formState.errors.url.message}
        </span>
      )}
    </form>
  );
};
