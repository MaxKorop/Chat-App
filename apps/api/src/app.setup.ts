import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/** Settings shared by the real server (main.ts) and the tests, so the tests exercise what runs. */
export function configureApp(app: INestApplication, options: { trustProxy?: boolean } = {}) {
  app.use(helmet());
  app.setGlobalPrefix('api');
  // Behind Caddy the TCP peer is always the proxy: without this every user would share one rate limit.
  // Only enable it when a proxy really sits in front, otherwise X-Forwarded-For could be forged.
  if (options.trustProxy) (app as NestExpressApplication).set('trust proxy', 1);
}
