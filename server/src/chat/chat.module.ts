import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Chat, ChatSchema } from './chat.schema';
import { ChatGateway } from './chat.gateway';
import { JwtModule } from '@nestjs/jwt';

@Module({
    imports: [
        JwtModule.register({
            secret: String(process.env.JWT_SECRET),
            signOptions: { expiresIn: '24h' }
        }),
        MongooseModule.forFeature([{ name: Chat.name, schema: ChatSchema }])
    ],
    controllers: [ChatController],
    providers: [ChatService, ChatGateway],
})
export class ChatModule {}
