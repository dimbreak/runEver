import { z } from 'zod';
import { WireSelectorSchema } from '../../../base.schema';

export const CalendarActionSchema = z.object({
  k: z.literal('calendar'),
  q: WireSelectorSchema,
  ctx: z.object({
    fromGoal: z.string().nullable(),
    fromPage: z.string().nullable(),
    fromArg: z.string().nullable(),
  }),
});

export type CalendarAction = z.infer<typeof CalendarActionSchema>;
