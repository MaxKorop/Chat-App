import { Injectable, Logger } from '@nestjs/common';

import { env } from '../../config/env';
import { decrypt, encrypt, type Keyring } from './encryption';

export const UNREADABLE_MESSAGE = "[message can't be decrypted]";

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly ring: Keyring = { keys: env.MESSAGE_KEYS, currentId: env.MESSAGE_KEY_ID };

  encrypt(plain: string, chatId: string, messageId: string): string {
    return encrypt(plain, this.ring, chatId, messageId);
  }

  decrypt(payload: string, chatId: string, messageId: string): string {
    return decrypt(payload, this.ring, chatId, messageId);
  }

  /** One damaged row must not break a whole page of messages. Logs the id, never the content. */
  decryptOrPlaceholder(payload: string, chatId: string, messageId: string): string {
    try {
      return this.decrypt(payload, chatId, messageId);
    } catch {
      this.logger.error(`Message ${messageId} could not be decrypted`);
      return UNREADABLE_MESSAGE;
    }
  }
}
