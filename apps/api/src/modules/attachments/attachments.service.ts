import { randomUUID } from 'node:crypto';

import type { AttachmentDto } from '@chat/shared';
import {
  BadRequestException,
  Injectable,
  Logger,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { sanitizeFileName } from './file-name';
import { detectImageType, type ImageType } from './image-type';

const EXTENSION: Record<ImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(userId: string, files: Express.Multer.File[] | undefined): Promise<AttachmentDto[]> {
    if (!files?.length) throw new BadRequestException('No files were uploaded');

    // Check every file first, so that one bad file never leaves the others stored.
    const prepared = files.map((file) => {
      const mimeType = detectImageType(file.buffer);
      if (!mimeType) {
        throw new UnsupportedMediaTypeException(
          'Only PNG, JPEG, GIF and WebP images can be uploaded',
        );
      }
      const id = randomUUID();
      return {
        file,
        id,
        mimeType,
        // The extension comes from the detected content, never from the client's file name.
        storageKey: `attachments/${userId}/${id}.${EXTENSION[mimeType]}`,
        fileName: sanitizeFileName(file.originalname, `image.${EXTENSION[mimeType]}`),
      };
    });

    try {
      for (const { file, storageKey, mimeType } of prepared) {
        await this.storage.upload(storageKey, file.buffer, mimeType);
      }
      // A message lists its attachments by creation time, so give each file its own millisecond:
      // that keeps the order in which they were uploaded.
      const now = Date.now();
      await this.prisma.attachment.createMany({
        data: prepared.map(({ id, storageKey, fileName, mimeType, file }, index) => ({
          id,
          uploaderId: userId,
          storageKey,
          fileName,
          mimeType,
          size: file.size,
          createdAt: new Date(now + index),
        })),
      });
    } catch (error) {
      // Do not leave files behind that no database row points to.
      await this.storage
        .deleteMany(prepared.map((p) => p.storageKey))
        .catch((cleanupError: Error) => {
          this.logger.error(
            `Could not remove files after a failed upload: ${cleanupError.message}`,
          );
        });
      throw error;
    }

    return Promise.all(
      prepared.map(async ({ id, fileName, mimeType, file, storageKey }) => ({
        id,
        fileName,
        mimeType,
        size: file.size,
        url: await this.storage.getUrl(storageKey),
      })),
    );
  }
}
