import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { normalizeUrlValue } from '../utils/formatter';
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
  const { activeTabId, navigateTab } = useTabStore();
  const { register, handleSubmit, formState, reset } = useForm<UrlFormValues>({
    resolver: zodResolver(urlSchema),
    defaultValues: { url: url ?? '' },
  });

  useEffect(() => {
    reset({ url: url ?? '' });
  }, [reset, url]);

  const onFormSubmit = async (data: UrlFormValues) => {
    const nextUrl = data.url;
    if (!activeTabId || !nextUrl) return;
    await navigateTab(activeTabId, nextUrl);
    reset({ url: nextUrl });
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
        {...register('url')}
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
