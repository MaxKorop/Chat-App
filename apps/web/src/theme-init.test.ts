import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_COLORS } from '@/lib/theme';

// public/theme-init.js runs in <head> before React, so the page never flashes the wrong theme.
// It is a separate file (not inline) because the production Content-Security-Policy forbids inline scripts.
const script = readFileSync(
  path.resolve(import.meta.dirname, '..', 'public', 'theme-init.js'),
  'utf8',
);
const run = () => new Function(script)();

function systemPrefersDark(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('dark') && dark }));
}
const store = (preference: string) =>
  localStorage.setItem('theme', JSON.stringify({ state: { preference }, version: 0 }));

beforeEach(() => {
  document.documentElement.className = '';
  document.head.innerHTML = '<meta name="theme-color" content="">';
});
afterEach(() => vi.unstubAllGlobals());

describe('theme-init.js', () => {
  it('uses the system theme when nothing was chosen', () => {
    systemPrefersDark(true);
    run();
    expect(document.documentElement).toHaveClass('dark');
    expect(document.querySelector('meta[name=theme-color]')).toHaveAttribute(
      'content',
      THEME_COLORS.dark,
    );
  });

  it('uses the saved choice, whatever the system says', () => {
    systemPrefersDark(true);
    store('light');
    run();
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.querySelector('meta[name=theme-color]')).toHaveAttribute(
      'content',
      THEME_COLORS.light,
    );
  });

  it('applies a saved "dark" on a light system', () => {
    systemPrefersDark(false);
    store('dark');
    run();
    expect(document.documentElement).toHaveClass('dark');
  });

  it('never breaks the page: unreadable storage means "system"', () => {
    systemPrefersDark(false);
    localStorage.setItem('theme', '{not json');
    expect(run).not.toThrow();
    expect(document.documentElement).not.toHaveClass('dark');
  });
});
