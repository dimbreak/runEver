import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { normalizeUrlValue } from '../utils/formatter';
import { Input } from './ui/input';
import { Button } from './ui/button';

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
  onSubmit: (url: string) => Promise<void> | void;
};

export const UrlBar: React.FC<UrlBarProps> = ({ url = '', onSubmit }) => {
  const { register, handleSubmit, formState, reset } = useForm<UrlFormValues>({
    resolver: zodResolver(urlSchema),
    defaultValues: { url: url ?? '' },
  });

  useEffect(() => {
    reset({ url: url ?? '' });
  }, [reset, url]);

  const onFormSubmit = async (data: UrlFormValues) => {
    await onSubmit(data.url);
    reset({ url: data.url });
  };

  return (
    <form
      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
      onSubmit={handleSubmit(onFormSubmit)}
    >
      <Input
        type="text"
        placeholder="Enter a URL or search term"
        className="flex-1"
        {...register('url')}
      />
      <Button type="submit" disabled={formState.isSubmitting} size="sm">
        Go
      </Button>
      {formState.errors.url && (
        <span className="text-[11px] font-medium text-rose-600 px-1">
          {formState.errors.url.message}
        </span>
      )}
    </form>
  );
};
