import { useEffect, useSyncExternalStore } from 'react';

import { applyTheme, resolveTheme, type Theme } from '@/lib/theme';
import { useThemeStore } from '@/stores/theme-store';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeToSystemTheme(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const systemPrefersDark = () => window.matchMedia(DARK_QUERY).matches;

/** "light" or "dark": the user's choice, or the system's while the choice is "system". */
export function useResolvedTheme(): Theme {
  const preference = useThemeStore((state) => state.preference);
  const systemDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark);
  return resolveTheme(preference, systemDark);
}

/** Keeps the page in step with the theme. Mounted once, in the providers. */
export function useApplyTheme(): Theme {
  const theme = useResolvedTheme();
  useEffect(() => applyTheme(theme), [theme]);
  return theme;
}
