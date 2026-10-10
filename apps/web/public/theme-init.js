// Runs in <head>, before React, so the first paint already has the right theme (no flash).
// It is a file and not an inline script because the production Content-Security-Policy forbids inline scripts.
// Keep it in step with src/lib/theme.ts (colours) and src/stores/theme-store.ts (storage key and shape).
(function () {
  var colors = { light: '#f7fbfb', dark: '#1b292d' };
  var preference = 'system';
  try {
    var saved = JSON.parse(localStorage.getItem('theme') || 'null');
    if (saved && saved.state && saved.state.preference) preference = saved.state.preference;
  } catch {
    // unreadable storage: follow the system
  }
  var dark =
    preference === 'dark' ||
    (preference !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var theme = dark ? 'dark' : 'light';
  var root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = theme;
  var meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', colors[theme]);
})();
