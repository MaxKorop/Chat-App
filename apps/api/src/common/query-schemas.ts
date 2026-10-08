import { z } from 'zod';

export const uuidSchema = z.uuid();
export const searchQuerySchema = z.object({ q: z.string().max(100).default('') });
export type SearchQuery = z.infer<typeof searchQuerySchema>;
