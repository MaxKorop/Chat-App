import 'dotenv/config';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests run against a separate database on the same Postgres as development,
// so they can never touch development data.
const devUrl = process.env.DATABASE_URL ?? 'postgresql://chat:chat@localhost:5432/chat';
const testDbUrl = devUrl.replace(/\/[^/?]+(\?|$)/, '/chat_test$1');
process.env.TEST_DATABASE_URL = testDbUrl;

// env.ts validates the environment on import, so every test run needs a complete (fake) one.
const baseEnv = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-test-secret-test-secret-123',
  JWT_EXPIRES_IN: '1h',
  MESSAGE_KEYS: `1:${Buffer.alloc(32, 1).toString('base64')}`,
  MESSAGE_KEY_ID: '1',
  S3_BUCKET: 'chat-attachments-test',
};

export default defineConfig({
  oxc: false, // Vite 8: otherwise oxc strips the decorator metadata that Nest's DI needs
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/test/**', // test helpers
        'src/generated/**', // Prisma's generated client
        'src/main.ts', // starts the server; exercised by the smoke test, not by unit tests
      ],
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // a little under the measured values (99.3 / 97.0 / 100 / 99.8): a drop fails the run
      thresholds: { statements: 98, branches: 95, functions: 99, lines: 98 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          exclude: ['src/**/*.int.spec.ts'],
          env: { ...baseEnv, DATABASE_URL: 'postgresql://test:test@localhost:5432/test' },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['src/**/*.int.spec.ts'],
          globalSetup: ['./src/test/global-setup.ts'],
          // one database, so files run one after another
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
          env: {
            ...baseEnv,
            DATABASE_URL: testDbUrl,
            S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:8333',
            S3_PUBLIC_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:8333',
            S3_ACCESS_KEY_ID: 'dev',
            S3_SECRET_ACCESS_KEY: 'dev',
          },
        },
      },
    ],
  },
});
