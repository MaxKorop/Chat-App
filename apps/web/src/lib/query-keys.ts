/** Cache keys, in one place so a screen and the realtime handler always agree on them. */
export const chatKeys = {
  /** the chat list; `['chats']` is also the prefix of everything below */
  list: ['chats'] as const,
  detail: (chatId: string) => ['chats', chatId] as const,
  messages: (chatId: string) => ['chats', chatId, 'messages'] as const,
  /** the prefix of every chat search */
  searches: ['chats', 'search'] as const,
  search: (query: string) => ['chats', 'search', query] as const,
};

export const userKeys = {
  me: ['me'] as const,
  /** the prefix of every user query, `detail` and `search` included */
  all: ['users'] as const,
  detail: (userId: string) => ['users', userId] as const,
  search: (query: string) => ['users', 'search', query] as const,
  friends: ['friends'] as const,
};
