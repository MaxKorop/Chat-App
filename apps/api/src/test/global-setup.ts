import { execFileSync } from 'node:child_process';

import { Client } from 'pg';

/** Creates the `chat_test` database if needed and applies all migrations to it. */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  const database = url.pathname.slice(1);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Integration tests need Postgres at ${url.host}. Start it with \`pnpm infra:up\`.\n${(error as Error).message}`,
      { cause: error },
    );
  }
  const exists = await client.query('select 1 from pg_database where datname = $1', [database]);
  if (!exists.rowCount) await client.query(`create database "${database}"`);
  await client.end();

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}
