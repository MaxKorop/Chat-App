import { Monitor, Moon, Sun } from 'lucide-react';

import type { ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/stores/theme-store';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Light, dark, or whatever the device uses. */
export function AppearancePicker() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          onClick={() => setPreference(value)}
          className={cn(
            'text-muted-foreground flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
            'hover:text-foreground focus-visible:ring-ring/50 outline-none focus-visible:ring-3',
            preference === value && 'bg-card text-foreground shadow-sm',
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
