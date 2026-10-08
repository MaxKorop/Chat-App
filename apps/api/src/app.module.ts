import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';

import { ChatModule } from './chat/chat.module';
import { ImageModule } from './image/image.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    MongooseModule.forRoot(process.env.DB_CONNECTION_STRING, {
      dbName: 'ChatDB',
    }),
    UserModule,
    ChatModule,
    ImageModule,
  ],
})
export class AppModule {}
