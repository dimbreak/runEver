import { z } from 'zod';

export const promptAttachmentSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  data: z.instanceof(ArrayBuffer),
});

export const promptAttachmentsSchema = z.array(promptAttachmentSchema);

export type PromptAttachment = z.infer<typeof promptAttachmentSchema>;

