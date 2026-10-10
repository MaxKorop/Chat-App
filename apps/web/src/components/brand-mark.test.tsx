import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandMark } from './brand-mark';

describe('BrandMark', () => {
  it('is decorative by default: the name next to it says what the app is', () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('can be labelled, and then it is an image with that name', () => {
    render(<BrandMark title="Chat App" />);
    expect(screen.getByRole('img', { name: 'Chat App' })).toBeInTheDocument();
  });

  it('gives each logo its own gradient id, so two on one page do not clash', () => {
    const { container } = render(
      <>
        <BrandMark />
        <BrandMark />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('uses the same colours as public/favicon.svg, so the tab icon and the logo match', () => {
    const svg = readFileSync(
      path.resolve(import.meta.dirname, '..', '..', 'public', 'favicon.svg'),
      'utf8',
    );
    const colours = (source: string) =>
      [...source.matchAll(/(?:stop-color|stopColor|fill)=["'](#[0-9a-f]{6})["']/gi)].map((m) =>
        m[1]!.toLowerCase(),
      );
    const { container } = render(<BrandMark />);
    expect(colours(container.innerHTML.replaceAll('stop-color', 'stopColor'))).toEqual(
      colours(svg),
    );
  });
});
