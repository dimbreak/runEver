import { z } from 'zod';

const BrowserActionRiskSchema = z.literal(['l', 'm', 'h']);
const WireWaitNetworkSchema = z.object({
  t: z.literal('network'),
  a: z.union([z.literal('idle0'), z.literal('idle2')]),
});
const WireWaitDomSchema = z.object({
  t: z.union([z.literal('appear'), z.literal('disappear')]),
  a: z.string(),
});
const WireWaitNavigationSchema = z.object({
  t: z.literal('navigation'),
  url: z.string().optional(), // for main assign current url
});
const WireWaitTimeSchema = z.object({
  t: z.literal('time'),
  ms: z.number(),
});
const WireSelectorSchema = z.union([
  z.string(),
  z.object({
    id: z.string(),
    args: z.array(z.string()).optional(),
  }),
]);

/** ---------------- WireWait ---------------- */
export const WireWaitSchema = z
  .union([
    WireWaitNetworkSchema,
    WireWaitDomSchema,
    WireWaitTimeSchema,
    WireWaitNavigationSchema,
  ])
  .and(z.object({ to: z.number().optional().nullable() }));

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
  q: WireSelectorSchema,
});

const ScrollActionSchema = z.object({
  k: z.literal('scroll'),
  x: z.number().optional(),
  y: z.number().optional(),
  q: z.string().optional(),
});

const FocusActionSchema = z.object({
  k: z.literal('focus'),
  q: WireSelectorSchema,
});

const DndActionSchema = z.object({
  k: z.literal('dragAndDrop'),
  sq: WireSelectorSchema,
  dq: WireSelectorSchema.optional(),
  mv: z
    .union([z.object({ x: z.number(), y: z.number() }), z.null()])
    .optional(),
});

const KeyActionSchema = z.object({
  k: z.literal('key'),
  key: z.string(),
  a: z.union([z.literal('keyDown'), z.literal('keyUp'), z.literal('keyPress')]),
  q: WireSelectorSchema.optional(),
  c: z.boolean().optional(),
  al: z.boolean().optional(),
  s: z.boolean().optional(),
  m: z.boolean().optional(),
});

const InputActionSchema = z.object({
  k: z.literal('input'),
  q: WireSelectorSchema,
  v: z.string(),
});

const NotifyUserActionSchema = z.object({
  k: z.literal('botherUser'),
  warn: z.string(),
  rc: z.string().optional(),
  missingInfos: z.array(z.string()).optional(),
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
  rc: z.string(),
  sc: z.boolean().optional(),
});

/** Discriminated union by `k` */
export const WireActionSchema = z.discriminatedUnion('k', [
  MouseActionSchema,
  ScrollActionSchema,
  FocusActionSchema,
  DndActionSchema,
  KeyActionSchema,
  InputActionSchema,
  NotifyUserActionSchema,
  SetCtxActionSchema,
  SetArgumentActionSchema,
  UrlActionSchema,
]);

/** WireAction & { w?: WireWait; to?: number } */
export const WireActionWithWaitSchema = z.object({
  intent: z.string(),
  risk: BrowserActionRiskSchema,
  action: WireActionSchema,
  pre: WireWaitSchema.optional(),
  post: WireWaitSchema.optional(),
});

/** ---------------- LlmWireResult ---------------- */
export const ExecutorLlmResultSchema = z.object({
  a: z.array(WireActionWithWaitSchema),
  e: z.string().optional(),
  todo: FollowupActionSchema.optional(),
  clearQueue: z.boolean().optional(),
});

/** (Optional) inferred TS types */
export type WireWait = z.infer<typeof WireWaitSchema>;
export type WireAction = z.infer<typeof WireActionSchema>;
export type WireFollowupAction = z.infer<typeof FollowupActionSchema>;
export type WireActionWithWait = z.infer<typeof WireActionWithWaitSchema>;
export type WireSelector = z.infer<typeof WireSelectorSchema>;

export type ExecutorLlmResult = z.infer<typeof ExecutorLlmResultSchema>;
export type WireWaitDom = z.infer<typeof WireWaitDomSchema>;
