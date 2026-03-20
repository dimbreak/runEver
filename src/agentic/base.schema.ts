import { z } from 'zod';

export const WireSelectorSchema = z.union([
  z.string(),
  z.object({
    id: z.string(),
    argKeys: z.array(z.string().nullable()).optional(),
  }),
]);
export const RiskOrComplexityLevelSchema = z.literal(['l', 'm', 'h']);
export const WireWaitNetworkSchema = z.object({
  t: z.literal('net'),
  a: z.union([z.literal('idle0'), z.literal('idle2')]),
});

export const WireWaitMsgSchema = z.object({
  t: z.literal('blockHereAndWaitForNewIncomingMsg').optional().nullable(),
  q: WireSelectorSchema.nullable().optional(),
  id1st: z.string().optional().nullable(),
  idLast: z.string().optional().nullable(),
});
export const WireWaitDomSchemaV2 = z.object({
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
export const WireWaitDomSchema = z.object({
  t: z.union([z.literal('appear'), z.literal('disappear')]),
  q: WireSelectorSchema,
});
export const WireWaitNavigationSchema = z.object({
  t: z.literal('navigation'),
  url: z.string().optional(), // for main assign current url
});
export const WireWaitTimeSchema = z.object({
  t: z.literal('time'),
  ms: z.number(),
});

/** ---------------- WireWait ---------------- */
export const WireWaitSchema = z
  .union([
    WireWaitNetworkSchema,
    WireWaitDomSchema,
    // WireWaitDomSchemaV2,
    WireWaitMsgSchema,
    WireWaitTimeSchema,
    WireWaitNavigationSchema,
  ])
  .and(z.object({ to: z.number().optional().nullable() }));

/** ---------------- WireAction (base) ---------------- */
export const MouseActionSchema = z.object({
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

export const ClickSendBtnAndWaitReplyActionSchema = z.object({
  k: z.literal('clickSendBtnAndWaitReply'),
  btn: WireSelectorSchema,
  dialog: WireSelectorSchema,
  id1st: WireSelectorSchema,
  idLast: WireSelectorSchema,
});

export const WaitForNewMsgActionSchema = z.object({
  k: z.literal('waitForNewMsg'),
  dialog: WireSelectorSchema,
  id1st: WireSelectorSchema,
  idLast: WireSelectorSchema,
});

export const ChecklistActionSchema = z.object({
  k: z.literal('checklist'),
  a: z.union([
    z.literal('add'),
    z.literal('cancel'),
    z.literal('working'),
    z.literal('verified'),
  ]),
  rework: z.boolean().optional().nullable(),
  pos: z.number().optional().nullable(),
  add: z.string().array().optional().nullable(),
  cancelReason: z.string().optional().nullable(),
  force: z.literal('I SWEAR IT IS CORRECT').optional().nullable(),
  verifiedProve: z
    .object({
      domId: z.string(),
      proveOfWork: z.string(),
    })
    .optional()
    .nullable(),
});

export const AddNewTaskActionSchema = z.object({
  k: z.literal('addNewTask'),
  afterCpId: z.number().optional().nullable(),
  checkPoints: z.string().array(),
  permitFromGoal: z.string(),
  src: z.string(),
  taskRisk: RiskOrComplexityLevelSchema,
});

export const ScrollActionSchema = z.object({
  k: z.literal('scroll'),
  to: z.union([WireSelectorSchema, z.tuple([z.number(), z.number()])]),
  over: WireSelectorSchema.optional().nullable(),
});

export const FocusActionSchema = z.object({
  k: z.literal('focus'),
  q: WireSelectorSchema,
});

export const DownloadActionSchema = z.object({
  k: z.literal('download'),
  a: WireSelectorSchema,
  t: z.union([z.literal('link'), z.literal('img'), z.literal('bg-img')]),
  filename: z.string().optional().nullable(),
});

export const ScreenshotActionSchema = z.object({
  k: z.literal('screenshot'),
  a: WireSelectorSchema.optional().nullable(),
  filename: z.string(),
});

export const DndActionSchema = z.object({
  k: z.literal('dragAndDrop'),
  sq: WireSelectorSchema,
  dq: WireSelectorSchema.optional().nullable(),
  mv: z
    .union([z.object({ x: z.number(), y: z.number() }), z.null()])
    .optional(),
});

export const SlideToValActionSchema = z.object({
  k: z.literal('slideToVal'),
  q: WireSelectorSchema,
  num: z.number(),
});

export const KeyActionSchema = z.object({
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

export const InputActionSchema = z.object({
  k: z.literal('input'),
  q: WireSelectorSchema,
  v: z.union([z.string(), z.array(z.string())]),
  c: z.literal('noClear').nullable().optional(),
});

export const NotifyUserActionSchema = z.object({
  k: z.literal('botherUser'),
  warn: z.string(),
  rc: z.string().optional().nullable(),
  missingInfos: z.array(z.string()).optional().nullable(),
});

export const SetCtxActionSchema = z.object({
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

export const SetArgumentActionSchema = z.object({
  k: z.literal('setArg'),
  kv: z.record(
    z.string(),
    z.union([z.string(), ArgumentValueFromElementSchema]),
  ),
});

export const UrlActionSchema = z.object({
  k: z.literal('url'),
  u: z.union([
    z.literal('next'),
    z.literal('forward'),
    z.literal('reload'),
    z.string(),
  ]),
});

export const TabActionSchema = z.object({
  k: z.literal('tab'),
  id: z.number(),
  url: z.string().optional().nullable(),
  noteBeforeLeave: z.string(),
});

export const SelectTextActionSchema = z.object({
  k: z.literal('selectTxt'),
  q: WireSelectorSchema,
  txt: z.string(),
});

const DescriptAttachmentSchema = z.object({
  name: z.string(),
  desc: z.string(),
});

export const FollowupActionSchema = z.object({
  tip: z.string(),
  sc: z.boolean().optional().nullable(),
  readFiles: z.array(z.string()).optional().nullable(),
  descAttachment: z.array(DescriptAttachmentSchema).nullable().optional(),
});
