import { z } from 'zod';

import { LIMITS } from '../constants';

export const usernameSchema = z
  .string()
  .trim()
  .min(LIMITS.USERNAME_MIN)
  .max(LIMITS.USERNAME_MAX)
  .regex(/^[a-zA-Z0-9_.]+$/, 'Only letters, digits, "_" and "."');

export const signUpSchema = z.object({
  email: z.email(),
  username: usernameSchema,
  // 72 bytes is the most bcrypt hashes
  password: z.string().min(LIMITS.PASSWORD_MIN).max(72),
});

export const logInSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type LogInInput = z.infer<typeof logInSchema>;
