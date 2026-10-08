import 'dotenv/config';
import { z } from 'zod';

import { parseKeyring } from './keyring';

// `S3_ENDPOINT=` (an empty line in .env) should mean "not set"
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('7d'),
    MESSAGE_KEYS: z.string().transform((raw, ctx) => {
      try {
        return parseKeyring(raw);
      } catch (error) {
        ctx.addIssue({ code: 'custom', message: (error as Error).message });
        return z.NEVER;
      }
    }),
    MESSAGE_KEY_ID: z.coerce.number().int(),
    S3_BUCKET: z.string().min(1),
    S3_REGION: z.string().default('us-east-1'),
    // Left out in production: the SDK then talks to AWS and uses the EC2 instance role
    S3_ENDPOINT: optional(z.url()),
    S3_PUBLIC_ENDPOINT: optional(z.url()),
    S3_ACCESS_KEY_ID: optional(z.string()),
    S3_SECRET_ACCESS_KEY: optional(z.string()),
  })
  .refine((env) => env.MESSAGE_KEYS.has(env.MESSAGE_KEY_ID), {
    path: ['MESSAGE_KEY_ID'],
    message: 'is not one of the key ids in MESSAGE_KEYS',
  });

export type Env = z.output<typeof envSchema>;

/** Validates the environment once, at startup, and reports every problem at once. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment:\n${problems.join('\n')}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
