import z from 'zod';

const ApprovedSchema = z.object({
  result: z.literal('approved'),
});

const RejectSchema = z.object({
  result: z.literal('reject'),
  reason: z.string(),
});

const RequireExtraDetailSchema = z.object({
  result: z.literal('requireExtraDetail'),
  htmlExtraLevel: z.literal(true).optional(),
  largerScreenshot: z.literal(true).optional(),
});

const RequireUserApprovalSchema = z.object({
  result: z.literal('requireUserApproval'),
  messageToUser: z.string(),
});

export const AuditResultSchema = z.discriminatedUnion('result', [
  ApprovedSchema,
  RejectSchema,
  RequireExtraDetailSchema,
  RequireUserApprovalSchema,
]);

export type AuditResult = z.infer<typeof AuditResultSchema>;
