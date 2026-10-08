import { LIMITS } from '@chat/shared';
import { Controller, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

import { type AuthUser, CurrentUser } from '../../common/current-user.decorator';
import { AttachmentsService } from './attachments.service';

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  // Multer enforces the limits while reading the request: too many files → 400, too big → 413.
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', LIMITS.ATTACHMENTS_PER_MESSAGE, {
      limits: { fileSize: LIMITS.ATTACHMENT_MAX_BYTES },
      // multer reads multipart file names as Latin-1 by default, which garbles "фото.png"
      defParamCharset: 'utf8',
    } as MulterOptions),
  )
  upload(@CurrentUser() user: AuthUser, @UploadedFiles() files: Express.Multer.File[]) {
    return this.attachments.upload(user.id, files);
  }
}
