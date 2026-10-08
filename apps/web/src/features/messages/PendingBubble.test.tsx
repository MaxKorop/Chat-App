import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePendingStore, type PendingMessage } from '@/stores/pending-store';
import { makeMessage } from '@/test/factories';
import { fakeSocket } from '@/test/fake-socket';
import { renderWithProviders } from '@/test/utils';

import { PendingBubble } from './PendingBubble';

vi.mock('socket.io-client', async () => (await import('@/test/fake-socket')).socketIoMock);
vi.mock('./api');

const pending = (patch: Partial<PendingMessage> = {}): PendingMessage => ({
  clientId: 'c1',
  chatId: 'chat-1',
  content: 'hello',
  files: [],
  status: 'sending',
  createdAt: '2026-01-05T10:00:00.000Z',
  ...patch,
});

beforeEach(() => {
  fakeSocket.reset();
  usePendingStore.getState().reset();
});

describe('PendingBubble', () => {
  it('shows a message that is being sent, with a clock instead of ticks', () => {
    renderWithProviders(<PendingBubble message={pending()} />);
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByLabelText('Sending')).toBeInTheDocument();
  });

  it('mentions attached images', () => {
    renderWithProviders(
      <PendingBubble
        message={pending({
          content: undefined,
          files: [new File(['x'], 'a.png'), new File(['y'], 'b.png')],
        })}
      />,
    );
    expect(screen.getByText('2 images')).toBeInTheDocument();
  });

  describe('when sending failed', () => {
    const failed = pending({
      status: 'failed',
      error: 'No connection to the server. Message not delivered.',
      attachmentIds: ['a1'],
    });

    it('says so, with the reason', () => {
      renderWithProviders(<PendingBubble message={failed} />);
      expect(screen.getByText('Not sent')).toBeInTheDocument();
      expect(
        screen.getByText('No connection to the server. Message not delivered.'),
      ).toBeInTheDocument();
    });

    it('retries with the same clientId and the files that were already uploaded', async () => {
      fakeSocket.ackResponder = () => ({
        ok: true,
        data: makeMessage({ id: 'm9', seq: 9, chatId: 'chat-1', clientId: 'c1' }),
      });
      usePendingStore.getState().upsert(failed);
      const user = userEvent.setup();
      renderWithProviders(<PendingBubble message={failed} />);

      await user.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(fakeSocket.sent('message:send')).toHaveLength(1));
      expect(fakeSocket.sent('message:send')[0]).toMatchObject({
        clientId: 'c1',
        attachmentIds: ['a1'],
        content: 'hello',
      });
    });

    it('can be discarded', async () => {
      usePendingStore.getState().upsert(failed);
      const user = userEvent.setup();
      renderWithProviders(<PendingBubble message={failed} />);
      await user.click(screen.getByRole('button', { name: 'Discard' }));
      expect(usePendingStore.getState().byChat).toEqual({});
    });
  });
});
