import { randomUUID } from 'node:crypto';

import {
  canDeleteMessage,
  canEditMessage,
  type DeleteMessageEventInput,
  type EditMessageEventInput,
  type MessageDto,
  type MessagesPage,
  type SendMessageEventOutput,
} from '@chat/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { DomainEvents, type MessageDeletedEvent } from '../../common/domain-events';
import { isUniqueViolation } from '../../common/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatsService } from '../chats/chats.service';
import { EncryptionService } from '../crypto/encryption.service';
import { StorageService } from '../storage/storage.service';
import { MessageMapper, messageInclude } from './message.mapper';

/**
 * Message operations as plain methods: they take a user id, throw ordinary Nest exceptions and
 * announce what happened through domain events. They know nothing about sockets, so the same code
 * serves the WebSocket gateway and could serve a REST endpoint.
 */
@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
    private readonly crypto: EncryptionService,
    private readonly storage: StorageService,
    private readonly mapper: MessageMapper,
    private readonly events: EventEmitter2,
  ) {}

  async send(userId: string, input: SendMessageEventOutput): Promise<MessageDto> {
    const { chatId, clientId } = input;
    await this.chats.assertMember(chatId, userId);

    // Idempotency: a retried send (the acknowledgement was lost) returns the stored message.
    const existing = await this.findByClientId(userId, clientId, chatId);
    if (existing) return existing;
    if (input.replyToId) await this.assertMessageInChat(input.replyToId, chatId);

    const id = randomUUID(); // generated here: the id is part of what the ciphertext is bound to
    const attachmentIds = [...new Set(input.attachmentIds)];
    let row;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        // One statement bumps the chat's counter and locks its row, so concurrent sends get distinct,
        // gap-free numbers. If anything below fails, the counter is rolled back with the rest.
        const { lastSeq } = await tx.chat.update({
          where: { id: chatId },
          data: { lastSeq: { increment: 1 }, lastMessageAt: new Date() },
          select: { lastSeq: true },
        });
        await tx.message.create({
          data: {
            id,
            chatId,
            seq: lastSeq,
            clientId,
            senderId: userId,
            replyToId: input.replyToId,
            content: input.content ? this.crypto.encrypt(input.content, chatId, id) : null,
          },
        });
        if (attachmentIds.length) {
          const { count } = await tx.attachment.updateMany({
            where: { id: { in: attachmentIds }, uploaderId: userId, messageId: null },
            data: { messageId: id },
          });
          if (count !== attachmentIds.length) throw new BadRequestException('Invalid attachments');
        }
        return tx.message.findUniqueOrThrow({ where: { id }, include: messageInclude });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // The same send arrived twice at once and the other one won: hand back its message.
      const winner = await this.findByClientId(userId, clientId, chatId);
      if (winner) return winner;
      throw error;
    }

    const dto = await this.mapper.toDto(row);
    this.events.emit(DomainEvents.MessageCreated, dto);
    return dto;
  }

  async edit(userId: string, input: EditMessageEventInput): Promise<MessageDto> {
    const message = await this.findOrFail(input.messageId);
    await this.chats.assertMember(message.chatId, userId);
    if (!canEditMessage(userId, message.senderId))
      throw new ForbiddenException('You can only edit your own messages');

    const row = await this.prisma.message.update({
      where: { id: message.id },
      data: {
        content: this.crypto.encrypt(input.content, message.chatId, message.id),
        editedAt: new Date(),
      },
      include: messageInclude,
    });
    const dto = await this.mapper.toDto(row);
    this.events.emit(DomainEvents.MessageUpdated, dto);
    return dto;
  }

  async delete(userId: string, input: DeleteMessageEventInput): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: input.messageId },
      select: {
        id: true,
        chatId: true,
        senderId: true,
        chat: { select: { type: true } },
        attachments: { select: { storageKey: true } },
      },
    });
    if (!message) throw new NotFoundException('Message not found');
    const member = await this.chats.assertMember(message.chatId, userId);
    if (
      !canDeleteMessage({
        chatType: message.chat.type,
        myRole: member.role,
        myId: userId,
        senderId: message.senderId,
      })
    ) {
      throw new ForbiddenException('You cannot delete this message');
    }

    await this.prisma.message.delete({ where: { id: message.id } }); // the attachment rows go with it
    try {
      await this.storage.deleteMany(message.attachments.map((a) => a.storageKey));
    } catch (error) {
      // The message is already gone for everyone; a leftover file is only wasted space.
      this.logger.error(
        `Could not delete files of message ${message.id}: ${(error as Error).message}`,
      );
    }
    this.events.emit(DomainEvents.MessageDeleted, {
      chatId: message.chatId,
      messageId: message.id,
    } satisfies MessageDeletedEvent);
  }

  /** One page of history, newest first. `before` is the seq of the oldest message already shown. */
  async list(
    userId: string,
    chatId: string,
    query: { before?: number | undefined; limit: number },
  ): Promise<MessagesPage> {
    await this.chats.assertMember(chatId, userId);
    const rows = await this.prisma.message.findMany({
      where: { chatId, ...(query.before ? { seq: { lt: query.before } } : {}) },
      orderBy: { seq: 'desc' },
      take: query.limit + 1, // one extra row tells whether there is an older page
      include: messageInclude,
    });
    const page = rows.slice(0, query.limit);
    return {
      items: await Promise.all(page.map((row) => this.mapper.toDto(row))),
      nextBefore: rows.length > query.limit ? page[page.length - 1]!.seq : null,
    };
  }

  private async findByClientId(
    userId: string,
    clientId: string,
    chatId: string,
  ): Promise<MessageDto | null> {
    const row = await this.prisma.message.findUnique({
      where: { senderId_clientId: { senderId: userId, clientId } },
      include: messageInclude,
    });
    if (!row) return null;
    if (row.chatId !== chatId)
      throw new ConflictException('This clientId was already used for another chat');
    return this.mapper.toDto(row);
  }

  private async findOrFail(id: string) {
    const message = await this.prisma.message.findUnique({
      where: { id },
      select: { id: true, chatId: true, senderId: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    return message;
  }

  private async assertMessageInChat(messageId: string, chatId: string) {
    const found = await this.prisma.message.count({ where: { id: messageId, chatId } });
    if (!found) throw new BadRequestException('You can only reply to a message of the same chat');
  }
}
