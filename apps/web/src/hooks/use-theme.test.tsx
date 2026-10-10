import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useThemeStore } from '@/stores/theme-store';

import { useApplyTheme, useResolvedTheme } from './use-theme';

/** a matchMedia whose answer a test can change, with the change event */
function fakeSystemTheme(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query.includes('dark') ? dark : false;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    set(value: boolean) {
      dark = value;
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

beforeEach(() => {
  document.documentElement.className = '';
  useThemeStore.setState({ preference: 'system' });
});
afterEach(() => vi.unstubAllGlobals());

describe('useResolvedTheme', () => {
  it('follows the system preference while the choice is "system", and reacts when it changes', () => {
    const system = fakeSystemTheme(false);
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('light');
    act(() => system.set(true));
    expect(result.current).toBe('dark');
  });

  it('ignores the system once the user has chosen', () => {
    const system = fakeSystemTheme(true);
    useThemeStore.setState({ preference: 'light' });
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('light');
    act(() => system.set(false));
    expect(result.current).toBe('light');
  });

  it('stops listening to the system when unmounted', () => {
    const system = fakeSystemTheme(false);
    const { unmount } = renderHook(() => useResolvedTheme());
    expect(system.listeners.size).toBe(1);
    unmount();
    expect(system.listeners.size).toBe(0);
  });
});

describe('useApplyTheme', () => {
  it('puts the resolved theme on the page, and updates it when the user chooses', () => {
    fakeSystemTheme(false);
    renderHook(() => useApplyTheme());
    expect(document.documentElement).not.toHaveClass('dark');
    act(() => useThemeStore.getState().setPreference('dark'));
    expect(document.documentElement).toHaveClass('dark');
  });
});
