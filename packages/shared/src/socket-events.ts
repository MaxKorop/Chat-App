import type { MarkReadEventInput, TypingEventInput } from './schemas/chat';
import type {
  DeleteMessageEventInput,
  EditMessageEventInput,
  MessageDto,
  SendMessageEventInput,
} from './schemas/message';

export type Ack<T = void> = { ok: true; data: T } | { ok: false; error: string };
type AckFn<T = void> = (response: Ack<T>) => void;

export interface ClientToServerEvents {
  'message:send': (input: SendMessageEventInput, ack: AckFn<MessageDto>) => void;
  'message:edit': (input: EditMessageEventInput, ack: AckFn<MessageDto>) => void;
  'message:delete': (input: DeleteMessageEventInput, ack: AckFn) => void;
  'chat:read': (input: MarkReadEventInput) => void; // fire-and-forget
  typing: (input: TypingEventInput) => void; // fire-and-forget, volatile
}

export interface ServerToClientEvents {
  'message:created': (message: MessageDto) => void;
  'message:updated': (message: MessageDto) => void;
  'message:deleted': (payload: { chatId: string; messageId: string }) => void;
  'chat:read': (payload: { chatId: string; userId: string; seq: number }) => void;
  typing: (payload: {
    chatId: string;
    userId: string;
    username: string;
    isTyping: boolean;
  }) => void;
  'chat:changed': (payload: { chatId: string }) => void; // created / someone joined → refetch lists
  'presence:changed': (payload: { userId: string; isOnline: boolean }) => void;
}
