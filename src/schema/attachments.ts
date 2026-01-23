import { z } from 'zod';

export const promptAttachmentSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  data: z
    .union([
      z.string(),
      z.instanceof(ArrayBuffer),
      z.instanceof(Uint8Array),
      z.instanceof(Buffer),
    ])
    .nullable(),
  path: z.string().nullable().optional(),
  desc: z.string().nullable().optional(),
});

export const promptAttachmentsSchema = z.array(promptAttachmentSchema);

export type PromptAttachment = z.infer<typeof promptAttachmentSchema>;
