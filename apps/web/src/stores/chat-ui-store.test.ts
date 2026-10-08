import type { MessageDto } from '@chat/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { useChatUiStore } from './chat-ui-store';

const message = { id: 'm1', chatId: 'chat-1' } as MessageDto;

beforeEach(() => useChatUiStore.getState().reset());

describe('useChatUiStore', () => {
  it('starts with nothing selected and a connection that is still being made', () => {
    expect(useChatUiStore.getState()).toMatchObject({
      activeChatId: null,
      replyTo: null,
      editingMessageId: null,
      dialog: null,
      profileUserId: null,
      connection: 'connecting',
    });
  });

  it('opening another chat clears the reply and edit state of the previous one', () => {
    const store = useChatUiStore.getState();
    store.openChat('chat-1');
    store.setReplyTo(message);
    store.setEditing('m2');

    store.openChat('chat-2');
    expect(useChatUiStore.getState()).toMatchObject({
      activeChatId: 'chat-2',
      replyTo: null,
      editingMessageId: null,
    });
  });

  it('closing the chat is openChat(null)', () => {
    useChatUiStore.getState().openChat('chat-1');
    useChatUiStore.getState().openChat(null);
    expect(useChatUiStore.getState().activeChatId).toBeNull();
  });

  it('tracks dialogs, the profile being shown and the connection state', () => {
    const store = useChatUiStore.getState();
    store.setDialog('createChat');
    store.showProfile('user-1');
    store.setConnection('offline');
    expect(useChatUiStore.getState()).toMatchObject({
      dialog: 'createChat',
      profileUserId: 'user-1',
      connection: 'offline',
    });
  });

  it('remembers that the connection worked once, so "connecting" can later mean "reconnecting"', () => {
    const store = useChatUiStore.getState();
    expect(useChatUiStore.getState().hasBeenOnline).toBe(false);
    store.setConnection('offline');
    expect(useChatUiStore.getState().hasBeenOnline).toBe(false);
    store.setConnection('online');
    store.setConnection('connecting');
    expect(useChatUiStore.getState().hasBeenOnline).toBe(true);
    store.reset();
    expect(useChatUiStore.getState().hasBeenOnline).toBe(false);
  });

  it('reset returns everything to the start', () => {
    const store = useChatUiStore.getState();
    store.openChat('chat-1');
    store.setDialog('settings');
    store.setConnection('online');
    store.reset();
    expect(useChatUiStore.getState()).toMatchObject({
      activeChatId: null,
      dialog: null,
      connection: 'connecting',
    });
  });
});
