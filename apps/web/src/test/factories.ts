import type {
  ChatDetailsDto,
  ChatSummaryDto,
  MeDto,
  MessageDto,
  PublicUserDto,
} from '@chat/shared';

let counter = 0;
const uuid = () => {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
};

export const makeMessage = (overrides: Partial<MessageDto> = {}): MessageDto => ({
  id: uuid(),
  chatId: 'chat-1',
  seq: 1,
  clientId: null,
  sender: { id: 'user-1', username: 'alice' },
  content: 'hello',
  replyTo: null,
  attachments: [],
  createdAt: '2026-01-05T10:00:00.000Z',
  editedAt: null,
  ...overrides,
});

export const makeMe = (overrides: Partial<MeDto> = {}): MeDto => ({
  id: 'user-1',
  username: 'alice',
  about: '',
  lastSeenAt: '2026-01-05T10:00:00.000Z',
  allowFriendRequests: true,
  email: 'alice@example.com',
  hideLastSeen: false,
  hideInSearch: false,
  ...overrides,
});

export const makeUser = (overrides: Partial<PublicUserDto> = {}): PublicUserDto => ({
  id: uuid(),
  username: 'bob',
  about: '',
  isOnline: false,
  lastSeenAt: '2026-01-05T09:00:00.000Z',
  isFriend: false,
  allowFriendRequests: true,
  ...overrides,
});

export const makeChatSummary = (overrides: Partial<ChatSummaryDto> = {}): ChatSummaryDto => ({
  id: 'chat-1',
  type: 'GROUP',
  title: 'Study group',
  isPublic: false,
  isMember: true,
  unreadCount: 0,
  lastMessage: null,
  ...overrides,
});

export const makeChatDetails = (overrides: Partial<ChatDetailsDto> = {}): ChatDetailsDto => ({
  ...makeChatSummary(),
  description: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  members: [
    { userId: 'user-1', username: 'alice', role: 'OWNER', lastReadSeq: 0 },
    { userId: 'user-2', username: 'bob', role: 'MEMBER', lastReadSeq: 0 },
  ],
  ...overrides,
});
