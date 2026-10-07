import { z } from 'zod';

export const attachmentSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  url: z.url(),
});

export type AttachmentDto = z.infer<typeof attachmentSchema>;
