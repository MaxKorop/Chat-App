import { Module } from '@nestjs/common';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';

import { HttpThrottlerGuard } from './common/http-throttler.guard';
import { env } from './config/env';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { ChatsModule } from './modules/chats/chats.module';
import { CryptoModule } from './modules/crypto/crypto.module';
import { MessagesModule } from './modules/messages/messages.module';
import { PresenceModule } from './modules/presence/presence.module';
import { StorageModule } from './modules/storage/storage.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.JWT_EXPIRES_IN as JwtSignOptions['expiresIn'] },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    EventEmitterModule.forRoot(),
    PrismaModule,
    PresenceModule,
    CryptoModule,
    StorageModule,
    AuthModule,
    UsersModule,
    ChatsModule,
    MessagesModule,
    AttachmentsModule,
  ],
  providers: [
    // validates every `@Body({ schema })`, `@Query({ schema })` and `@Param(…, { schema })` with zod
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    // the order matters: rate-limit first, then authenticate
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
