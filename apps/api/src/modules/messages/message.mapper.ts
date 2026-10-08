import type { MessageDto } from '@chat/shared';
import { truncate } from '@chat/shared';
import { Injectable } from '@nestjs/common';

import { PHOTO_PREVIEW, PREVIEW_MAX } from '../../common/preview';
import type { Prisma } from '../../generated/prisma/client';
import { EncryptionService } from '../crypto/encryption.service';
import { StorageService } from '../storage/storage.service';

/** What the mapper needs from the database to build a MessageDto. */
export const messageInclude = {
  sender: { select: { id: true, username: true } },
  replyTo: {
    select: {
      id: true,
      chatId: true,
      content: true,
      sender: { select: { username: true } },
      attachments: { select: { id: true }, take: 1 },
    },
  },
  attachments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.MessageInclude;

export type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

@Injectable()
export class MessageMapper {
  constructor(
    private readonly crypto: EncryptionService,
    private readonly storage: StorageService,
  ) {}

  /** Decrypts the text and signs the attachment URLs: the last step before a message leaves the server. */
  async toDto(row: MessageRow): Promise<MessageDto> {
    const reply = row.replyTo;
    const replyText = reply?.content
      ? this.crypto.decryptOrPlaceholder(reply.content, reply.chatId, reply.id)
      : null;
    return {
      id: row.id,
      chatId: row.chatId,
      seq: row.seq,
      clientId: row.clientId,
      sender: row.sender,
      content: row.content
        ? this.crypto.decryptOrPlaceholder(row.content, row.chatId, row.id)
        : null,
      replyTo: reply
        ? {
            id: reply.id,
            senderUsername: reply.sender?.username ?? null,
            preview:
              replyText !== null
                ? truncate(replyText, PREVIEW_MAX)
                : reply.attachments.length
                  ? PHOTO_PREVIEW
                  : '',
          }
        : null,
      attachments: await Promise.all(
        row.attachments.map(async (attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          url: await this.storage.getUrl(attachment.storageKey),
        })),
      ),
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
    };
  }
}
