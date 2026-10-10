import { beforeEach, describe, expect, it } from 'vitest';

import { useThemeStore } from './theme-store';

beforeEach(() => {
  localStorage.clear();
  useThemeStore.setState({ preference: 'system' });
});

describe('theme store', () => {
  it('follows the system until the user chooses', () => {
    expect(useThemeStore.getState().preference).toBe('system');
  });

  it('remembers the choice under the key the pre-React script reads', () => {
    useThemeStore.getState().setPreference('light');
    const saved = JSON.parse(localStorage.getItem('theme')!);
    expect(saved.state).toEqual({ preference: 'light' });
  });

  it('survives a reload', async () => {
    localStorage.setItem('theme', JSON.stringify({ state: { preference: 'dark' }, version: 0 }));
    await useThemeStore.persist.rehydrate();
    expect(useThemeStore.getState().preference).toBe('dark');
  });
});
