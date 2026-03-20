import { z } from 'zod';
import { FillFormActionSchema } from './addOns/skills/form/form.schema';
import {
  DndActionSchema,
  DownloadActionSchema,
  ClickSendBtnAndWaitReplyActionSchema,
  FocusActionSchema,
  FollowupActionSchema,
  InputActionSchema,
  KeyActionSchema,
  MouseActionSchema,
  NotifyUserActionSchema,
  RiskOrComplexityLevelSchema,
  ScreenshotActionSchema,
  ScrollActionSchema,
  SelectTextActionSchema,
  SetArgumentActionSchema,
  SetCtxActionSchema,
  SlideToValActionSchema,
  TabActionSchema,
  ChecklistActionSchema,
  UrlActionSchema,
  WaitForNewMsgActionSchema,
  WireSelectorSchema,
  WireWaitDomSchema,
  WireWaitSchema,
  AddNewTaskActionSchema,
  UseSkillsActionSchema,
} from './base.schema';
import { CalendarActionSchema } from './addOns/skills/calendar/calendar.schema';
import { ComboboxActionSchema } from './addOns/skills/combobox/combobox.schema';

/** Discriminated union by `k` */
export const WireActionSchema = z.discriminatedUnion('k', [
  MouseActionSchema,
  ClickSendBtnAndWaitReplyActionSchema,
  WaitForNewMsgActionSchema,
  ScrollActionSchema,
  FocusActionSchema,
  DndActionSchema,
  SlideToValActionSchema,
  KeyActionSchema,
  InputActionSchema,
  NotifyUserActionSchema,
  SetCtxActionSchema,
  SetArgumentActionSchema,
  UrlActionSchema,
  DownloadActionSchema,
  SelectTextActionSchema,
  TabActionSchema,
  ScreenshotActionSchema,
  FillFormActionSchema,
  CalendarActionSchema,
  ComboboxActionSchema,
  ChecklistActionSchema,
  AddNewTaskActionSchema,
  UseSkillsActionSchema,
]);

/** WireAction & { w?: WireWait; to?: number } */
export const WireActionWithWaitSchema = z.object({
  intent: z.string(),
  risk: RiskOrComplexityLevelSchema.default('l'),
  action: WireActionSchema,
  pre: WireWaitSchema.optional().nullable(),
  post: WireWaitSchema.optional().nullable(),
  cp: z.number().array().optional().nullable(),
  unverify: z.boolean().optional().nullable(),
});

export const WireSubTaskSchema = z.object({
  subTaskPrompt: z.string(),
  addArgs: z.record(z.string(), z.string()).optional().nullable(),
  complexity: RiskOrComplexityLevelSchema.default('l'),
});

export const WireActionOrSubTaskSchema = z.union([
  WireActionWithWaitSchema,
  WireSubTaskSchema,
]);

/** ---------------- LlmWireResult ---------------- */
export const ExecutorLlmResultSchema = z.object({
  a: WireActionWithWaitSchema.array(),
  e: z.string().optional().nullable(),
  next: FollowupActionSchema.nullable().optional(),
  endSess: z.string().optional().nullable(),
});

/** (Optional) inferred TS types */
export type WireWait = z.infer<typeof WireWaitSchema>;
export type WireAction = z.infer<typeof WireActionSchema>;
export type WireFollowupAction = z.infer<typeof FollowupActionSchema>;
export type WireSubTask = z.infer<typeof WireSubTaskSchema>;
export type WireActionWithWait = z.infer<typeof WireActionWithWaitSchema>;
export type WireSelector = z.infer<typeof WireSelectorSchema>;
export type WireTabAction = z.infer<typeof TabActionSchema>;

export type ExecutorLlmResult = z.infer<typeof ExecutorLlmResultSchema>;
export type WireWaitDom = z.infer<typeof WireWaitDomSchema>;
export type RiskOrComplexityLevel = z.infer<typeof RiskOrComplexityLevelSchema>;
