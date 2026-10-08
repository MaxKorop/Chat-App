export const LIMITS = {
  USERNAME_MIN: 2,
  USERNAME_MAX: 25,
  PASSWORD_MIN: 8,
  ABOUT_MAX: 100,
  CHAT_NAME_MIN: 3,
  CHAT_NAME_MAX: 50,
  CHAT_DESCRIPTION_MAX: 255,
  MESSAGE_MAX: 4000,
  ATTACHMENTS_PER_MESSAGE: 10,
  ATTACHMENT_MAX_BYTES: 5 * 1024 * 1024,
  MESSAGES_PAGE_SIZE: 50,
} as const;

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
