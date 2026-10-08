import { Module } from '@nestjs/common';

import { ChatsModule } from '../chats/chats.module';
import { MessageMapper } from './message.mapper';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [ChatsModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessageMapper],
  exports: [MessagesService],
})
export class MessagesModule {}
