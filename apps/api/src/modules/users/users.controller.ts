import { type UpdateMeInput, updateMeSchema } from '@chat/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';

import { type AuthUser, CurrentUser } from '../../common/current-user.decorator';
import {
  type SearchQuery,
  searchQuerySchema,
  uuidSchema as uuid,
} from '../../common/query-schemas';
import { UsersService } from './users.service';

// Static routes (`search`, `me…`) are declared before `:id`.
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('search')
  search(@CurrentUser() me: AuthUser, @Query({ schema: searchQuerySchema }) query: SearchQuery) {
    return this.users.search(me.id, query.q);
  }

  @Get('me/friends')
  friends(@CurrentUser() me: AuthUser) {
    return this.users.listFriends(me.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() me: AuthUser, @Body({ schema: updateMeSchema }) body: UpdateMeInput) {
    return this.users.updateMe(me.id, body);
  }

  @Get(':id')
  getOne(@CurrentUser() me: AuthUser, @Param('id', { schema: uuid }) id: string) {
    return this.users.getById(me.id, id);
  }

  @Post(':id/friend')
  addFriend(@CurrentUser() me: AuthUser, @Param('id', { schema: uuid }) id: string) {
    return this.users.addFriend(me.id, id);
  }

  @Delete(':id/friend')
  @HttpCode(204)
  async removeFriend(@CurrentUser() me: AuthUser, @Param('id', { schema: uuid }) id: string) {
    await this.users.removeFriend(me.id, id);
  }
}
