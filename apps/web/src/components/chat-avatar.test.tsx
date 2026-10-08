import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChatAvatar } from './chat-avatar';

describe('ChatAvatar', () => {
  it('shows the initials of the name', () => {
    render(<ChatAvatar name="Study group" />);
    expect(screen.getByText('SG')).toBeInTheDocument();
  });

  it('shows an "online" marker only when asked to', () => {
    const { rerender } = render(<ChatAvatar name="alice" />);
    expect(screen.queryByLabelText('online')).not.toBeInTheDocument();
    rerender(<ChatAvatar name="alice" online />);
    expect(screen.getByLabelText('online')).toBeInTheDocument();
  });
});
