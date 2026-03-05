import { z } from 'zod';
import { WireSelectorSchema } from '../../../base.schema';

export const CalendarActionSchema = z.object({
  k: z.literal('calendar'),
  q: WireSelectorSchema,
  ctx: z.object({
    goalHint: z.string().nullable(),
    pageHint: z.string().nullable(),
    argValHint: z.string().nullable(),
  }),
});

export type CalendarAction = z.infer<typeof CalendarActionSchema>;

export const CalendarValidateResultSchema = z.object({
  check: z.boolean(),
  failReason: z.string().nullable().optional(),
});
