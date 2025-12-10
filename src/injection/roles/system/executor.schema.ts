import z from "zod"

const WaitUntilSchema = z.union([
  z.literal('networkIdle0'),
  z.literal('networkIdle2'),
  z.object({
    type: z.enum(['appear', 'disappear']),
    querySelector: z.string(),
  }),
  z.number().describe('in ms'),
]);

const LlmActionSchema = z.object({
  // frameSelector: z.string().optional(),
  timeout: z.number().optional().describe('in ms'),
  waitFor: WaitUntilSchema.optional().describe('can combine with any action to wait before preform'),

  mouseAction: z.object({
    type: z.enum(['click', 'dblclick', 'mouseover', 'mousedown', 'mouseup', 'mouseout', 'mouseenter', 'mouseleave', 'mousemove']).describe('click/mousedown etc will auto simulate mouse move'),
    querySelector: z.string(),
  }).optional(),

  scrollAction: z.object({
    x: z.number().optional(),
    y: z.string().optional(),
    afterPromptContext: z.string().optional().describe('if require detail after scroll'),
  }).optional(),

  focusAction: z.object({
    querySelector: z.string(),
  }).optional(),

  blurAction: z.object({
    querySelector: z.string(),
  }).optional(),

  dndAction: z.object({
    srcQuerySelector: z.string(),
    dstQuerySelector: z.string().optional(),
    // 原 tuple -> 对象，避免不被 OpenAI 支持的 tuple JSON Schema
    moveByPx: z.object({
      x: z.number(),
      y: z.number(),
    }).optional(),
  }).optional(),

  keyAction: z.object({
    key: z.string(),
    type: z.enum(['keydown', 'keyup', 'keypress']).describe('just keypress for ordinary key action'),
    querySelector: z.string().optional(),
    ctrl: z.boolean().optional(),
    alt: z.boolean().optional(),
    shift: z.boolean().optional(),
    meta: z.boolean().optional(),
  }).optional(),

  inputAction: z.object({
    querySelector: z.string(),
    input: z.string(),
  }).optional(),

  askScreenshotAction: z.object({
    repromptContext: z.string(),
  }).optional(),

  notifyUserAction: z.object({
    messageToUser: z.string(),
    repromptContextIfUserResponse: z.string().nullable(),
  }).optional(),

  setContextAction: z.object({
    mode: z.enum(['append', 'prepend', 'set']).optional(),
    scope: z.enum(['global', 'will', 'roll', 'task', 'session']).optional(),
    value: z.string(),
  }).optional(),

  changeUrlAction: z.object({
    url: z.union([z.enum(['next', 'forward', 'reload']), z.string()]).describe('next, forward, reload or specific url'),
  }).optional(),

  requireRawHtmlAction: z.object({
    querySelector: z.string(),
    repromptContext: z.string(),
  }).optional(),

  followupAction: z.object({
    repromptContext: z.string().nullable(),
  }).optional(),
});

export const ExecutorLlmResultSchema = z.object({
  actions: z.array(LlmActionSchema),
  error: z.string().optional().describe("start with NO_RETRY to avoid retry if it wouldn't help"),
});

export type LlmAction = z.infer<typeof LlmActionSchema>;
export type ExecutorLlmResult = z.infer<typeof ExecutorLlmResultSchema>;

export type WaitUntil = z.infer<typeof WaitUntilSchema>;