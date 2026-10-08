import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { queryClient } from '@/lib/query-client';

import { Providers } from './providers';

function Probe() {
  return <p>{useQueryClient() === queryClient ? 'uses the app’s query client' : 'wrong client'}</p>;
}

describe('Providers', () => {
  it('gives the app its query client', () => {
    render(
      <Providers>
        <Probe />
      </Providers>,
    );
    expect(screen.getByText('uses the app’s query client')).toBeInTheDocument();
  });
});
