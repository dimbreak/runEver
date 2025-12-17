import z from 'zod';

const BrowserActionRiskSchema = z.literal(['l', 'm', 'h']);
const PlannerStepSchema = z.object({
  action: z.string(),
  risk: BrowserActionRiskSchema,
});

export const PlannerResultSchema = z.object({
  steps: z.array(PlannerStepSchema),
  todo: z.string().optional(),
  ask_user_question: z.string().optional(),
  parser: z.string().optional(),
});

export type PlannerResult = z.infer<typeof PlannerResultSchema>;
export type BrowserActionRisk = z.infer<typeof BrowserActionRiskSchema>;
