import { z } from 'zod';
import { BrowserActionRisk } from './planner.schema';

const WireWaitDomSchema = z.object({
  t: z.union([z.literal('appear'), z.literal('disappear')]),
  q: z.string(),
});

/** ---------------- WireWait ---------------- */
export const WireWaitSchema = z.union([
  z.literal('idle0'),
  z.literal('idle2'),
  z.number(),
  WireWaitDomSchema,
]);

/** ---------------- WireAction (base) ---------------- */
const MouseActionSchema = z.object({
  k: z.literal('mouse'),
  a: z.union([
    z.literal('click'),
    z.literal('dblclick'),
    z.literal('mouseover'),
    z.literal('mouseDown'),
    z.literal('mouseUp'),
    z.literal('mouseout'),
    z.literal('mouseEnter'),
    z.literal('mouseMove'),
    z.literal('mouseWheel'),
  ]),
  q: z.string(),
});

const ScrollActionSchema = z.object({
  k: z.literal('scroll'),
  x: z.number().optional(),
  y: z.number().optional(),
  q: z.string().optional(),
});

const FocusActionSchema = z.object({
  k: z.literal('focus'),
  q: z.string(),
});

const DndActionSchema = z.object({
  k: z.literal('dragAndDrop'),
  sq: z.string(),
  dq: z.string().optional(),
  mv: z
    .union([z.object({ x: z.number(), y: z.number() }), z.null()])
    .optional(),
});

const KeyActionSchema = z.object({
  k: z.literal('key'),
  key: z.string(),
  a: z.union([z.literal('keyDown'), z.literal('keyUp'), z.literal('keyPress')]),
  q: z.string().optional(),
  c: z.boolean().optional(),
  al: z.boolean().optional(),
  s: z.boolean().optional(),
  m: z.boolean().optional(),
});

const InputActionSchema = z.object({
  k: z.literal('input'),
  q: z.string(),
  v: z.string(),
});

const GetScreenshotActionSchema = z.object({
  k: z.literal('getScreenshot'),
  rc: z.string(),
});

const NotifyUserActionSchema = z.object({
  k: z.literal('notifyUser'),
  msg: z.string(),
  rc: z.union([z.string(), z.null()]).optional(),
});

const SetCtxActionSchema = z.object({
  k: z.literal('setCtx'),
  mode: z
    .union([z.literal('append'), z.literal('prepend'), z.literal('set')])
    .optional(),
  scope: z
    .union([
      z.literal('global'),
      z.literal('will'),
      z.literal('roll'),
      z.literal('task'),
      z.literal('session'),
    ])
    .optional(),
  v: z.string(),
});

const SetArgumentActionSchema = z.object({
  k: z.literal('setArgument'),
  a: z.string(),
  v: z.string().optional(),
  rc: z.string().optional(),
  attr: z.string().optional(),
});

const UrlActionSchema = z.object({
  k: z.literal('url'),
  u: z.union([
    z.literal('next'),
    z.literal('forward'),
    z.literal('reload'),
    z.string(),
  ]),
});

const FollowupActionSchema = z.object({
  k: z.literal('followup'),
  rc: z.union([z.string(), z.null()]).optional(),
});

/** Discriminated union by `k` */
export const WireActionSchema = z.discriminatedUnion('k', [
  MouseActionSchema,
  ScrollActionSchema,
  FocusActionSchema,
  DndActionSchema,
  KeyActionSchema,
  InputActionSchema,
  GetScreenshotActionSchema,
  NotifyUserActionSchema,
  SetCtxActionSchema,
  SetArgumentActionSchema,
  UrlActionSchema,
  FollowupActionSchema,
]);

/** WireAction & { w?: WireWait; to?: number } */
export const WireActionWithWaitSchema = WireActionSchema.and(
  z.object({
    w: WireWaitSchema.optional(),
    to: z.number().optional(),
  }),
);

/** ---------------- LlmWireResult ---------------- */
export const ExecutorLlmResultSchema = z.object({
  a: z.array(WireActionWithWaitSchema),
  e: z.string().optional(),
});

/** (Optional) inferred TS types */
export type WireWait = z.infer<typeof WireWaitSchema>;
export type WireAction = z.infer<typeof WireActionSchema>;
export type WireActionWithWaitAndRisk = z.infer<
  typeof WireActionWithWaitSchema
> & { risk: BrowserActionRisk; id: number };

export type ExecutorLlmResult = z.infer<typeof ExecutorLlmResultSchema>;
export type WireWaitDom = z.infer<typeof WireWaitDomSchema>;
