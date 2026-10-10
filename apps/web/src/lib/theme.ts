export type ThemePreference = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

/** The colour of the mobile browser bar: the page background of each theme (a test keeps them equal). */
export const THEME_COLORS: Record<Theme, string> = { light: '#f7fbfb', dark: '#1b292d' };

export const resolveTheme = (preference: ThemePreference, systemPrefersDark: boolean): Theme =>
  preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;

/** Puts a theme on the page. The same thing public/theme-init.js does before React starts. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  let meta = document.querySelector<HTMLMetaElement>('meta[name=theme-color]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = THEME_COLORS[theme];
}
