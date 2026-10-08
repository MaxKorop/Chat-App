// Run with `pnpm db:seed`. Fills the development database with demo data.
import { PrismaPg } from '@prisma/adapter-pg';

import { env } from '../src/config/env';
import { PrismaClient } from '../src/generated/prisma/client';
import { DEMO_PASSWORD, seedDatabase } from '../src/seed/seed';

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    await seedDatabase(prisma, { keys: env.MESSAGE_KEYS, currentId: env.MESSAGE_KEY_ID });
    console.warn(`Seeded alice, bob and carol (password: ${DEMO_PASSWORD})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
