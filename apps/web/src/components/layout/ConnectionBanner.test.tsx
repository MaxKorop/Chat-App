import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useChatUiStore } from '@/stores/chat-ui-store';

import { ConnectionBanner } from './ConnectionBanner';

const set = (connection: 'connecting' | 'online' | 'offline') =>
  act(() => useChatUiStore.getState().setConnection(connection));

beforeEach(() => useChatUiStore.getState().reset());

describe('ConnectionBanner', () => {
  it('says nothing while the first connection is being made, or when everything is fine', () => {
    render(<ConnectionBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    set('online');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says "Reconnecting…" after the connection was lost, until it is back', () => {
    render(<ConnectionBanner />);
    set('online');
    set('offline');
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
    set('connecting');
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
    set('online');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('also says so when the very first attempt fails (the server is down)', () => {
    render(<ConnectionBanner />);
    set('offline');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
