import { z } from 'zod';
import { WireSelectorSchema } from '../../../base.schema';

export const CalendarActionSchema = z.object({
  k: z.literal('calendar'),
  q: WireSelectorSchema,
  i: z.string().nullable().optional(),
});

export type CalendarAction = z.infer<typeof CalendarActionSchema>;
