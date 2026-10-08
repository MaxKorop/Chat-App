import { type CreateChatInput, createChatSchema } from '@chat/shared';
import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { type AuthUser, CurrentUser } from '../../common/current-user.decorator';
import { type SearchQuery, searchQuerySchema, uuidSchema } from '../../common/query-schemas';
import { ChatsService } from './chats.service';

// `search` is declared before `:id`
@Controller('chats')
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Get()
  list(@CurrentUser() me: AuthUser) {
    return this.chats.list(me.id);
  }

  @Get('search')
  search(@CurrentUser() me: AuthUser, @Query({ schema: searchQuerySchema }) query: SearchQuery) {
    return this.chats.search(me.id, query.q);
  }

  @Post()
  async create(
    @CurrentUser() me: AuthUser,
    @Body({ schema: createChatSchema }) body: CreateChatInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { chat, created } = await this.chats.create(me.id, body);
    res.status(created ? 201 : 200); // asking for a DM that already exists is not an error
    return chat;
  }

  @Get(':id')
  details(@CurrentUser() me: AuthUser, @Param('id', { schema: uuidSchema }) id: string) {
    return this.chats.details(me.id, id);
  }

  @Post(':id/join')
  join(@CurrentUser() me: AuthUser, @Param('id', { schema: uuidSchema }) id: string) {
    return this.chats.join(me.id, id);
  }
}
