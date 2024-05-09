import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { ChatModule } from './chat/chat.module';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        MongooseModule.forRoot(process.env.DB_CONNECTION_STRING, {
            dbName: 'ChatDB'
        }),
        UserModule,
        ChatModule
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule { }