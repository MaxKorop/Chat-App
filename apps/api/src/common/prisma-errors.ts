import { Prisma } from '../generated/prisma/client';

/** P2002: a unique constraint was violated */
export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
