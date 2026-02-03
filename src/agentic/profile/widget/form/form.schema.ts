import { z } from 'zod';
import { WireSelectorSchema } from '../../../base.schema';

const FillFormValueSchema = z.object({
  f: WireSelectorSchema,
  v: z.union([z.string(), z.string().array()]),
});

export const FillFormActionSchema = z.object({
  k: z.literal('fillForm'),
  q: WireSelectorSchema,
  data: z.union([z.array(FillFormValueSchema), z.string()]),
  fs: z.array(z.string()).optional().nullable(),
});

export type FillFormValue = z.infer<typeof FillFormValueSchema>;
export type FillFormAction = z.infer<typeof FillFormActionSchema>;
