import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { oklchToHex } from '@/test/color';

import { applyTheme, resolveTheme, THEME_COLORS } from './theme';

describe('resolveTheme', () => {
  it('follows the system only when asked to', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.head.innerHTML = '<meta name="theme-color" content="#000000">';
  });

  it('switches the dark class, the colour scheme and the browser bar colour', () => {
    applyTheme('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name=theme-color]')).toHaveAttribute(
      'content',
      THEME_COLORS.dark,
    );

    applyTheme('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.querySelector('meta[name=theme-color]')).toHaveAttribute(
      'content',
      THEME_COLORS.light,
    );
  });

  it('adds the theme-color meta tag when the page has none', () => {
    document.head.innerHTML = '';
    applyTheme('dark');
    expect(document.querySelector('meta[name=theme-color]')).toHaveAttribute(
      'content',
      THEME_COLORS.dark,
    );
  });
});

describe('the browser bar colours', () => {
  const css = readFileSync(path.resolve(import.meta.dirname, '..', 'styles.css'), 'utf8');
  const background = (selector: string) =>
    css.match(new RegExp(`^${selector}\\s*\\{[^}]*?--background:\\s*([^;]+);`, 'm'))![1]!;

  it('match the --background of each theme', () => {
    expect(THEME_COLORS.light).toBe(oklchToHex(background(':root')));
    expect(THEME_COLORS.dark).toBe(oklchToHex(background('\\.dark')));
  });
});
