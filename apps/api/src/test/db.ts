import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/** A client for the integration-test database (DATABASE_URL is set by vitest.config.ts). */
export function createTestPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
}

export async function resetDb(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE users, friendships, chats, chat_members, messages, attachments RESTART IDENTITY CASCADE',
  );
}
