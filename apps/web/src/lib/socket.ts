import type {
  Ack,
  ClientToServerEvents,
  DeleteMessageEventInput,
  EditMessageEventInput,
  MessageDto,
  SendMessageEventInput,
  ServerToClientEvents,
} from '@chat/shared';
import { io, type Socket } from 'socket.io-client';

import { useAuthStore } from '@/stores/auth-store';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** The one socket of the app. `useRealtime()` connects it once there is a token. */
export const socket: AppSocket = io({
  autoConnect: false,
  transports: ['websocket'], // must match the server: no long-polling
  auth: (done) => done({ token: useAuthStore.getState().token }), // read again on every (re)connect
});

const ACK_TIMEOUT_MS = 8_000;

/** Turns an acknowledgement into a promise, so commands plug into React Query mutations. */
async function call<T>(request: Promise<Ack<T>>): Promise<T> {
  let response: Ack<T>;
  try {
    response = await request;
  } catch {
    throw new Error('No connection to the server. Message not delivered.'); // no answer in time, or disconnected
  }
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

// No automatic retries: a failed send is shown to the user and retried on purpose, with the same
// clientId, which is safe because the server treats a repeated clientId as the same message.
// The client library types `timeout().emitWithAck` loosely, so the acknowledgement shape from the
// shared contract (`Ack<…>`) is stated once here, where it is received.
export const sendMessageOverSocket = (input: SendMessageEventInput) =>
  call(
    socket.timeout(ACK_TIMEOUT_MS).emitWithAck('message:send', input) as Promise<Ack<MessageDto>>,
  );
export const editMessageOverSocket = (input: EditMessageEventInput) =>
  call(
    socket.timeout(ACK_TIMEOUT_MS).emitWithAck('message:edit', input) as Promise<Ack<MessageDto>>,
  );
export const deleteMessageOverSocket = (input: DeleteMessageEventInput) =>
  call(socket.timeout(ACK_TIMEOUT_MS).emitWithAck('message:delete', input) as Promise<Ack<void>>);

// Fire and forget: no answer is expected.
export const markRead = (chatId: string, seq: number) =>
  void socket.emit('chat:read', { chatId, seq });
export const sendTyping = (chatId: string, isTyping: boolean) =>
  void socket.emit('typing', { chatId, isTyping });
