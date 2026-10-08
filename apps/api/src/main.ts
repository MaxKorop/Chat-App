import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app, { trustProxy: env.NODE_ENV === 'production' });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
bootstrap();
