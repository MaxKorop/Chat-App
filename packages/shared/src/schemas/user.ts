import { z } from 'zod';

import { LIMITS } from '../constants';
import { usernameSchema } from './auth';

export const publicUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  about: z.string(),
  isOnline: z.boolean(),
  lastSeenAt: z.iso.datetime().nullable(), // null when the user hides it
  isFriend: z.boolean(),
  allowFriendRequests: z.boolean(),
});

export const meSchema = publicUserSchema
  .omit({ isOnline: true, isFriend: true })
  .extend({ email: z.email(), hideLastSeen: z.boolean(), hideInSearch: z.boolean() });

export const updateMeSchema = z
  .object({
    username: usernameSchema,
    about: z.string().max(LIMITS.ABOUT_MAX),
    hideLastSeen: z.boolean(),
    hideInSearch: z.boolean(),
    allowFriendRequests: z.boolean(),
  })
  .partial();

export type PublicUserDto = z.infer<typeof publicUserSchema>;
export type MeDto = z.infer<typeof meSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
