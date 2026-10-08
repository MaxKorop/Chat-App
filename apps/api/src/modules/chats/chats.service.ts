import {
  type ChatDetailsDto,
  type ChatSummaryDto,
  type CreateChatInput,
  directKey,
  truncate,
} from '@chat/shared';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  type ChatMembersChangedEvent,
  type ChatReadEvent,
  DomainEvents,
} from '../../common/domain-events';
import { escapeLike } from '../../common/like';
import { PHOTO_PREVIEW, PREVIEW_MAX } from '../../common/preview';
import { isUniqueViolation } from '../../common/prisma-errors';
import type { Chat, ChatMember } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../crypto/encryption.service';

const SEARCH_LIMIT = 20;
const DELETED_USER = 'Deleted user';

type MemberWithName = ChatMember & { user: { username: string } };

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EncryptionService,
    private readonly events: EventEmitter2,
  ) {}

  /** My chats, the one with the newest message first. */
  async list(userId: string): Promise<ChatSummaryDto[]> {
    const memberships = await this.prisma.chatMember.findMany({
      where: { userId },
      include: {
        chat: {
          include: {
            // only needed to name a DM after the other person
            members: {
              where: { userId: { not: userId } },
              take: 1,
              include: { user: { select: { username: true } } },
            },
          },
        },
      },
      orderBy: [
        { chat: { lastMessageAt: { sort: 'desc', nulls: 'last' } } },
        { chat: { createdAt: 'desc' } },
      ],
    });
    return Promise.all(
      memberships.map((membership) =>
        this.summary(membership.chat, membership, membership.chat.members[0]),
      ),
    );
  }

  /** Public groups, for discovery. No messages or unread counts here. */
  async search(userId: string, query: string): Promise<ChatSummaryDto[]> {
    const q = query.trim();
    if (!q) return [];
    const chats = await this.prisma.chat.findMany({
      where: {
        type: 'GROUP',
        isPublic: true,
        name: { contains: escapeLike(q), mode: 'insensitive' },
      },
      orderBy: { name: 'asc' },
      take: SEARCH_LIMIT,
      include: { members: { where: { userId }, select: { userId: true } } },
    });
    return chats.map((chat) => ({
      id: chat.id,
      type: chat.type,
      title: chat.name ?? '',
      isPublic: chat.isPublic,
      isMember: chat.members.length > 0,
      unreadCount: 0,
      lastMessage: null,
    }));
  }

  async details(userId: string, chatId: string): Promise<ChatDetailsDto> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: {
          include: { user: { select: { username: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!chat) throw new NotFoundException('Chat not found');

    const membership = chat.members.find((m) => m.userId === userId);
    const previewable = chat.type === 'GROUP' && chat.isPublic;
    if (!membership && !previewable)
      throw new ForbiddenException('You are not a member of this chat');

    const summary = await this.summary(
      chat,
      membership,
      chat.members.find((m) => m.userId !== userId),
    );
    return {
      ...summary,
      description: chat.description,
      createdAt: chat.createdAt.toISOString(),
      // who is in a chat is for its members only
      members: membership
        ? chat.members.map((m) => ({
            userId: m.userId,
            username: m.user.username,
            role: m.role,
            lastReadSeq: m.lastReadSeq,
          }))
        : [],
    };
  }

  async create(
    userId: string,
    input: CreateChatInput,
  ): Promise<{ chat: ChatDetailsDto; created: boolean }> {
    return input.type === 'DIRECT'
      ? this.createDirect(userId, input.userId)
      : { chat: await this.createGroup(userId, input), created: true };
  }

  async join(userId: string, chatId: string): Promise<ChatDetailsDto> {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found');
    if (chat.type !== 'GROUP' || !chat.isPublic)
      throw new ForbiddenException('This chat is not public');

    try {
      // The cursor starts at the end: messages from before you joined are not "unread".
      await this.prisma.chatMember.create({ data: { chatId, userId, lastReadSeq: chat.lastSeq } });
      this.announce(chatId, [userId]);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error; // already a member: joining again changes nothing
    }
    return this.details(userId, chatId);
  }

  /** Returns the membership, or throws 403. Every message operation starts with this. */
  async assertMember(chatId: string, userId: string): Promise<ChatMember> {
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) throw new ForbiddenException('You are not a member of this chat');
    return member;
  }

  async getMemberChatIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });
    return memberships.map((m) => m.chatId);
  }

  /** Moves my read cursor forward. Monotonic and atomic: a stale or duplicate call is a no-op. */
  async markRead(userId: string, chatId: string, seq: number): Promise<void> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: { lastSeq: true },
    });
    if (!chat) throw new NotFoundException('Chat not found');

    const target = Math.min(seq, chat.lastSeq); // cannot read the future
    const { count } = await this.prisma.chatMember.updateMany({
      where: { chatId, userId, lastReadSeq: { lt: target } }, // also guarantees that I am a member
      data: { lastReadSeq: target },
    });
    if (count)
      this.events.emit(DomainEvents.ChatRead, {
        chatId,
        userId,
        seq: target,
      } satisfies ChatReadEvent);
  }

  // ── creation ───────────────────────────────────────────────────────────

  private async createDirect(userId: string, otherId: string) {
    if (otherId === userId) throw new BadRequestException('You cannot start a chat with yourself');
    const other = await this.prisma.user.findUnique({
      where: { id: otherId },
      select: { id: true },
    });
    if (!other) throw new NotFoundException('User not found');
    if (!(await this.areFriends(userId, otherId)))
      throw new ForbiddenException('You can only message your friends');

    const key = directKey(userId, otherId);
    const existing = await this.prisma.chat.findUnique({
      where: { directKey: key },
      select: { id: true },
    });
    if (existing) return { chat: await this.details(userId, existing.id), created: false };

    try {
      const chat = await this.prisma.chat.create({
        data: {
          type: 'DIRECT',
          directKey: key,
          createdById: userId,
          members: { create: [{ userId }, { userId: otherId }] },
        },
      });
      this.announce(chat.id, [userId, otherId]);
      return { chat: await this.details(userId, chat.id), created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // two people started the same chat at the same moment: the database picked a winner
      const winner = await this.prisma.chat.findUniqueOrThrow({
        where: { directKey: key },
        select: { id: true },
      });
      return { chat: await this.details(userId, winner.id), created: false };
    }
  }

  private async createGroup(userId: string, input: Extract<CreateChatInput, { type: 'GROUP' }>) {
    const memberIds = [...new Set(input.memberIds)].filter((id) => id !== userId);
    if (memberIds.length) {
      const friends = await this.prisma.friendship.count({
        where: { userId, friendId: { in: memberIds } },
      });
      if (friends !== memberIds.length)
        throw new ForbiddenException('You can only add your friends to a group');
    }

    const chat = await this.prisma.chat.create({
      data: {
        type: 'GROUP',
        name: input.name,
        description: input.description,
        isPublic: input.isPublic,
        createdById: userId,
        members: {
          create: [{ userId, role: 'OWNER' }, ...memberIds.map((id) => ({ userId: id }))],
        },
      },
    });
    this.announce(chat.id, [userId, ...memberIds]);
    return this.details(userId, chat.id);
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private announce(chatId: string, userIds: string[]) {
    this.events.emit(DomainEvents.ChatMembersChanged, {
      chatId,
      userIds,
    } satisfies ChatMembersChangedEvent);
  }

  private async areFriends(a: string, b: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { userId_friendId: { userId: a, friendId: b } },
    });
    return friendship !== null;
  }

  private async summary(
    chat: Chat,
    membership?: ChatMember,
    other?: MemberWithName,
  ): Promise<ChatSummaryDto> {
    const [lastMessage, unreadCount] = membership
      ? await Promise.all([this.lastMessage(chat.id), this.unreadCount(chat.id, membership)])
      : [null, 0];
    return {
      id: chat.id,
      type: chat.type,
      title: chat.type === 'GROUP' ? (chat.name ?? '') : (other?.user.username ?? DELETED_USER),
      isPublic: chat.isPublic,
      isMember: membership !== undefined,
      unreadCount,
      lastMessage,
    };
  }

  private async lastMessage(chatId: string): Promise<ChatSummaryDto['lastMessage']> {
    const message = await this.prisma.message.findFirst({
      where: { chatId },
      orderBy: { seq: 'desc' },
      select: {
        id: true,
        content: true,
        createdAt: true,
        attachments: { select: { id: true }, take: 1 },
      },
    });
    if (!message) return null;
    const text = message.content
      ? this.crypto.decryptOrPlaceholder(message.content, chatId, message.id)
      : null;
    return {
      preview:
        text !== null
          ? truncate(text, PREVIEW_MAX)
          : message.attachments.length
            ? PHOTO_PREVIEW
            : '',
      createdAt: message.createdAt.toISOString(),
    };
  }

  /** Messages after my read cursor that I did not write. A deleted sender (NULL) counts as someone else. */
  private unreadCount(chatId: string, membership: ChatMember) {
    return this.prisma.message.count({
      where: {
        chatId,
        seq: { gt: membership.lastReadSeq },
        OR: [{ senderId: { not: membership.userId } }, { senderId: null }],
      },
    });
  }
}
