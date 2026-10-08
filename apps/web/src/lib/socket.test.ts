import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { fakeSocket, ioCalls } from '@/test/fake-socket';

import {
  deleteMessageOverSocket,
  editMessageOverSocket,
  markRead,
  sendMessageOverSocket,
  sendTyping,
  socket,
} from './socket';

vi.mock('socket.io-client', async () => (await import('@/test/fake-socket')).socketIoMock);

const CHAT = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
const CLIENT = '9d8c7b6a-1f2e-4d3c-8b7a-6f5e4d3c2b1a';
const input = { chatId: CHAT, clientId: CLIENT, content: 'hello', attachmentIds: [] };

beforeEach(() => {
  const created = [...ioCalls]; // the socket is created once, when the module is first imported
  fakeSocket.reset();
  ioCalls.length = 0;
  ioCalls.push(...created);
});

describe('the socket', () => {
  it('is one shared socket that connects only when asked, speaks WebSocket only and uses the same origin', () => {
    expect(socket).toBe(fakeSocket);
    expect(ioCalls).toHaveLength(1);
    const [first, ...rest] = ioCalls[0]!;
    expect(rest).toEqual([]); // no URL: same origin, through the Vite proxy or Caddy
    expect(first).toMatchObject({ autoConnect: false, transports: ['websocket'] });
  });

  it('reads the token again on every (re)connect, so a refreshed login is picked up', () => {
    const options = ioCalls[0]![0] as { auth: (done: (data: unknown) => void) => void };
    const tokens: unknown[] = [];

    useAuthStore.setState({ token: 'first' });
    options.auth((data) => tokens.push(data));
    useAuthStore.setState({ token: 'second' });
    options.auth((data) => tokens.push(data));
    expect(tokens).toEqual([{ token: 'first' }, { token: 'second' }]);
  });
});

describe('commands over the socket', () => {
  it('sendMessageOverSocket resolves with the stored message and waits at most 8 seconds', async () => {
    const stored = { id: 'm1', seq: 1 };
    fakeSocket.ackResponder = () => ({ ok: true, data: stored });
    await expect(sendMessageOverSocket(input)).resolves.toBe(stored);
    expect(fakeSocket.sent('message:send')).toEqual([input]);
    expect(fakeSocket.lastAckTimeout).toBe(8_000);
  });

  it('turns a refusal from the server into an error with the server’s sentence', async () => {
    fakeSocket.ackResponder = () => ({ ok: false, error: 'You are not a member of this chat' });
    await expect(sendMessageOverSocket(input)).rejects.toThrow('You are not a member of this chat');
  });

  it('turns a missing answer (timeout, lost connection) into a message the user can act on', async () => {
    fakeSocket.ackResponder = () => {
      throw new Error('operation has timed out');
    };
    await expect(sendMessageOverSocket(input)).rejects.toThrow(
      'No connection to the server. Message not delivered.',
    );
  });

  it('edit and delete use their own events', async () => {
    fakeSocket.ackResponder = () => ({ ok: true, data: { id: 'm1' } });
    await editMessageOverSocket({ messageId: 'm1', content: 'fixed' });
    await deleteMessageOverSocket({ messageId: 'm1' });
    expect(fakeSocket.sent('message:edit')).toEqual([{ messageId: 'm1', content: 'fixed' }]);
    expect(fakeSocket.sent('message:delete')).toEqual([{ messageId: 'm1' }]);
  });
});

describe('fire-and-forget events', () => {
  it('markRead and sendTyping emit without waiting for an answer', () => {
    markRead(CHAT, 7);
    sendTyping(CHAT, true);
    expect(fakeSocket.sent('chat:read')).toEqual([{ chatId: CHAT, seq: 7 }]);
    expect(fakeSocket.sent('typing')).toEqual([{ chatId: CHAT, isTyping: true }]);
  });
});
