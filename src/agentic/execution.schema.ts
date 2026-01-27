import { z } from 'zod';

const WireSelectorSchema = z.union([
  z.string(),
  z.object({
    id: z.string(),
    argKeys: z.array(z.string().nullable()).optional(),
  }),
]);
const RiskOrComplexityLevelSchema = z.literal(['l', 'm', 'h']);
const WireWaitNetworkSchema = z.object({
  t: z.literal('network'),
  a: z.union([z.literal('idle0'), z.literal('idle2')]),
});
const WireWaitDomSchemaV2 = z.object({
  t: z.literal('domLongTime'),
  a: z.union([
    z.literal('any'),
    z.literal('attr'),
    z.literal('childAdd'),
    z.literal('childRm'),
    z.literal('txt'),
  ]),
  q: WireSelectorSchema,
});
const WireWaitDomSchema = z.object({
  t: z.union([z.literal('appear'), z.literal('disappear')]),
  q: WireSelectorSchema,
});
const WireWaitNavigationSchema = z.object({
  t: z.literal('navigation'),
  url: z.string().optional(), // for main assign current url
});
const WireWaitTimeSchema = z.object({
  t: z.literal('time'),
  ms: z.number(),
});

/** ---------------- WireWait ---------------- */
export const WireWaitSchema = z
  .union([
    WireWaitNetworkSchema,
    WireWaitDomSchema,
    WireWaitDomSchemaV2,
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
    z.literal('mouseenter'),
    z.literal('mousemove'),
    z.literal('mouseWheel'),
  ]),
  q: WireSelectorSchema,
  repeat: z.number().optional().nullable(),
});

const ScrollActionSchema = z.object({
  k: z.literal('scroll'),
  to: z.union([WireSelectorSchema, z.tuple([z.number(), z.number()])]),
  over: WireSelectorSchema.optional().nullable(),
});

const FocusActionSchema = z.object({
  k: z.literal('focus'),
  q: WireSelectorSchema,
});

const DownloadActionSchema = z.object({
  k: z.literal('download'),
  a: WireSelectorSchema,
  t: z.union([z.literal('link'), z.literal('img'), z.literal('bg-img')]),
  filename: z.string().optional().nullable(),
});

const ScreenshotActionSchema = z.object({
  k: z.literal('screenshot'),
  a: WireSelectorSchema.optional().nullable(),
  filename: z.string(),
});

const DndActionSchema = z.object({
  k: z.literal('dragAndDrop'),
  sq: WireSelectorSchema,
  dq: WireSelectorSchema.optional().nullable(),
  mv: z
    .union([z.object({ x: z.number(), y: z.number() }), z.null()])
    .optional(),
});

const SlideToValActionSchema = z.object({
  k: z.literal('slideToVal'),
  q: WireSelectorSchema,
  num: z.number(),
});

const KeyActionSchema = z.object({
  k: z.literal('key'),
  key: z.string(),
  a: z.union([
    z.literal('keyDown'),
    z.literal('keyUp'),
    z.literal('keyDownUp'),
    z.literal('keyPress'),
  ]),
  q: WireSelectorSchema.optional(),
  c: z.boolean().optional().nullable(),
  al: z.boolean().optional().nullable(),
  s: z.boolean().optional().nullable(),
  m: z.boolean().optional().nullable(),
  repeat: z.number().optional().nullable(),
});

const InputActionSchema = z.object({
  k: z.literal('input'),
  q: WireSelectorSchema,
  v: z.union([z.string(), z.array(z.string())]),
});

const NotifyUserActionSchema = z.object({
  k: z.literal('botherUser'),
  warn: z.string(),
  rc: z.string().optional().nullable(),
  missingInfos: z.array(z.string()).optional().nullable(),
});

const SetCtxActionSchema = z.object({
  k: z.literal('setCtx'),
  mode: z
    .union([z.literal('append'), z.literal('prepend'), z.literal('set')])
    .optional()
    .nullable(),
  scope: z
    .union([
      z.literal('global'),
      z.literal('will'),
      z.literal('roll'),
      z.literal('task'),
      z.literal('session'),
    ])
    .optional()
    .nullable(),
  v: z.string(),
});

const ArgumentValueFromElementSchema = z.object({
  q: WireSelectorSchema,
  attr: z.string().optional().nullable(),
});

const SetArgumentActionSchema = z.object({
  k: z.literal('setArg'),
  kv: z.record(
    z.string(),
    z.union([z.string(), ArgumentValueFromElementSchema]),
  ),
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

const TabActionSchema = z.object({
  k: z.literal('tab'),
  id: z.number(),
  url: z.string().optional().nullable(),
});

const SelectTextActionSchema = z.object({
  k: z.literal('selectTxt'),
  q: WireSelectorSchema,
  txt: z.string(),
});

const DescriptAttachmentSchema = z.object({
  name: z.string(),
  desc: z.string(),
});

const FollowupActionSchema = z.object({
  rc: z.string(),
  sc: z.boolean().optional().nullable(),
  readFiles: z.array(z.string()).optional().nullable(),
  descAttachment: z.array(DescriptAttachmentSchema).nullable().optional(),
});

/** Discriminated union by `k` */
export const WireActionSchema = z.discriminatedUnion('k', [
  MouseActionSchema,
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
]);

/** WireAction & { w?: WireWait; to?: number } */
export const WireActionWithWaitSchema = z.object({
  intent: z.string(),
  risk: RiskOrComplexityLevelSchema.default('l'),
  action: WireActionSchema,
  pre: WireWaitSchema.optional().nullable(),
  post: WireWaitSchema.optional().nullable(),
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
  a: z.union([z.array(WireActionWithWaitSchema), z.array(WireSubTaskSchema)]),
  e: z.string().optional(),
  todo: z.union([FollowupActionSchema, z.literal('finishedNoToDo')]),
  subtaskResp: z
    .union([z.literal('done'), z.string()])
    .nullable()
    .optional(),
});

/** (Optional) inferred TS types */
export type WireWait = z.infer<typeof WireWaitSchema>;
export type WireAction = z.infer<typeof WireActionSchema>;
export type WireFollowupAction = z.infer<typeof FollowupActionSchema>;
export type WireSubTask = z.infer<typeof WireSubTaskSchema>;
export type WireActionWithWait = z.infer<typeof WireActionWithWaitSchema>;
export type WireSelector = z.infer<typeof WireSelectorSchema>;
export type WireTabAction = z.infer<typeof TabActionSchema>;

export type ExecutorLlmResult = Omit<
  z.infer<typeof ExecutorLlmResultSchema>,
  'todo'
> & { todo?: WireFollowupAction };
export type WireWaitDom = z.infer<typeof WireWaitDomSchema>;
export type RiskOrComplexityLevel = z.infer<typeof RiskOrComplexityLevelSchema>;
