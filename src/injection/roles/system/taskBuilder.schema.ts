import z from "zod"

const TaskArgumentSchema = z.object({
  name: z.string(),
  description: z.string(),
});

const TaskSideEffectSchema = z.object({
  type: z.literal("sub_task"),
  task_name: z.string(),
  argument_mapping: z.union([
    z.record(z.string(), z.string()),
    z.string(),
  ]),
});

const AskQuestionSchema = z.object({
  type: z.literal("ask_question"),
  question: z.string(),
});

const TrialRunSchema = z.object({
  type: z.literal("trial_run"),
  task_prompt: z.string(),
});

const SaveTaskSchema = z.object({
  type: z.literal("save_task"),
  task_prompt: z.string(),
  description: z.string().optional(),
  arguments: z.array(TaskArgumentSchema),
  side_effects: z.array(TaskSideEffectSchema),
});

export const TaskBuilderResultSchema = z.discriminatedUnion("type", [
  AskQuestionSchema,
  TrialRunSchema,
  SaveTaskSchema,
]);

export type TaskArgument = z.infer<typeof TaskArgumentSchema>;
export type TaskSideEffect = z.infer<typeof TaskSideEffectSchema>;
export type TaskBuilderResult = z.infer<typeof TaskBuilderResultSchema>;
 