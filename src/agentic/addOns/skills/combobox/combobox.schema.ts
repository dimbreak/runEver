import { z } from 'zod';
import { WireSelectorSchema } from '../../../base.schema';

export const ComboboxActionSchema = z.object({
  k: z.literal('combobox'),
  q: WireSelectorSchema,
  v: z.string(),
});

export type ComboboxAction = z.infer<typeof ComboboxActionSchema>;
