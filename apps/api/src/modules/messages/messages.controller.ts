import { messagesQuerySchema } from '@chat/shared';
import { Controller, Get, Param, Query } from '@nestjs/common';
import type { z } from 'zod';

import { type AuthUser, CurrentUser } from '../../common/current-user.decorator';
import { uuidSchema } from '../../common/query-schemas';
import { MessagesService } from './messages.service';

type MessagesQuery = z.output<typeof messagesQuerySchema>;

/** Only history is REST. Sending, editing, deleting and reading go over the WebSocket. */
@Controller('chats/:chatId/messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(
    @CurrentUser() me: AuthUser,
    @Param('chatId', { schema: uuidSchema }) chatId: string,
    @Query({ schema: messagesQuerySchema }) query: MessagesQuery,
  ) {
    return this.messages.list(me.id, chatId, query);
  }
}
