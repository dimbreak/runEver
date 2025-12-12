import z from 'zod';

const PlannerStepSchema = z.object({
  p: z.string(),
  r: z.literal(['l', 'm', 'h']),
});

const PlannerTaskSchema = z.object({
  n: z.string(),
  p: z.string().optional(),
  s: z.array(PlannerStepSchema),
});

export const PlannerResultSchema = z.object({
  tasks: z.array(PlannerTaskSchema),
});

export type PlannerResult = z.infer<typeof PlannerResultSchema>;
