import { Module } from '@nestjs/common';

import { ChatsModule } from '../chats/chats.module';
import { MessagesModule } from '../messages/messages.module';
import { RealtimeGateway } from './realtime.gateway';

// Dependencies point one way: realtime → chats / messages. Services never import realtime,
// they only publish domain events, so there are no circular modules.
@Module({ imports: [ChatsModule, MessagesModule], providers: [RealtimeGateway] })
export class RealtimeModule {}
