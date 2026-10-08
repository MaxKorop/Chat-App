import type { MeDto, PublicUserDto, UpdateMeInput } from '@chat/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { escapeLike } from '../../common/like';
import { isUniqueViolation } from '../../common/prisma-errors';
import type { User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PresenceService } from '../presence/presence.service';
import { toMe, toPublicUser } from './users.mapper';

const SEARCH_LIMIT = 20;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async search(viewerId: string, query: string): Promise<PublicUserDto[]> {
    const q = query.trim();
    if (!q) return [];
    const users = await this.prisma.user.findMany({
      // plain text only: there are no regular expressions, and LIKE wildcards are escaped
      where: {
        username: { contains: escapeLike(q), mode: 'insensitive' },
        hideInSearch: false,
        id: { not: viewerId },
      },
      orderBy: { username: 'asc' },
      take: SEARCH_LIMIT,
    });
    return this.withContext(viewerId, users);
  }

  async getById(viewerId: string, id: string): Promise<PublicUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return (await this.withContext(viewerId, [user]))[0]!;
  }

  async updateMe(userId: string, input: UpdateMeInput): Promise<MeDto> {
    try {
      return toMe(await this.prisma.user.update({ where: { id: userId }, data: input }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('This username is already taken');
      throw error;
    }
  }

  async listFriends(userId: string): Promise<PublicUserDto[]> {
    const friends = await this.prisma.user.findMany({
      where: { friendOf: { some: { userId } } },
      orderBy: { username: 'asc' },
    });
    return friends.map((friend) =>
      toPublicUser(friend, { isOnline: this.presence.isOnline(friend.id), isFriend: true }),
    );
  }

  /** Friendship is instant and mutual, so it is stored as one row per direction. */
  async addFriend(userId: string, friendId: string): Promise<PublicUserDto> {
    if (userId === friendId) throw new BadRequestException('You cannot add yourself as a friend');
    const friend = await this.prisma.user.findUnique({ where: { id: friendId } });
    if (!friend) throw new NotFoundException('User not found');
    if (!friend.allowFriendRequests)
      throw new ForbiddenException('This user does not accept friend requests');

    await this.prisma.friendship.createMany({
      data: [
        { userId, friendId },
        { userId: friendId, friendId: userId },
      ],
      skipDuplicates: true, // adding someone twice is fine
    });
    return toPublicUser(friend, { isOnline: this.presence.isOnline(friend.id), isFriend: true });
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    await this.prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      },
    });
  }

  private async withContext(viewerId: string, users: User[]): Promise<PublicUserDto[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: { userId: viewerId, friendId: { in: users.map((u) => u.id) } },
      select: { friendId: true },
    });
    const friendIds = new Set(friendships.map((f) => f.friendId));
    return users.map((user) =>
      toPublicUser(user, {
        isOnline: this.presence.isOnline(user.id),
        isFriend: friendIds.has(user.id),
      }),
    );
  }
}
