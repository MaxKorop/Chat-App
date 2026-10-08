import { describe, expect, it } from 'vitest';

import * as shared from './index';

describe('public API of @chat/shared', () => {
  it('re-exports constants, schemas and utilities', () => {
    for (const name of [
      'LIMITS',
      'ALLOWED_IMAGE_TYPES',
      'signUpSchema',
      'logInSchema',
      'meSchema',
      'publicUserSchema',
      'updateMeSchema',
      'createChatSchema',
      'chatDetailsSchema',
      'chatSummarySchema',
      'markReadEventSchema',
      'typingEventSchema',
      'attachmentSchema',
      'sendMessageSchema',
      'sendMessageEventSchema',
      'editMessageEventSchema',
      'deleteMessageEventSchema',
      'messagesQuerySchema',
      'messageSchema',
      'messagesPageSchema',
      'directKey',
      'canEditMessage',
      'canDeleteMessage',
      'isReadBy',
      'formatTime',
      'formatDateTime',
      'formatLastSeen',
      'getInitials',
      'truncate',
    ]) {
      expect(shared, `missing export: ${name}`).toHaveProperty(name);
    }
  });
});
