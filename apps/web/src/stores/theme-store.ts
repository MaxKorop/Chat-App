import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ThemePreference } from '@/lib/theme';

type ThemeState = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

// The key and shape are read by public/theme-init.js before React starts: change both together.
export const useThemeStore = create<ThemeState>()(
  persist((set) => ({ preference: 'system', setPreference: (preference) => set({ preference }) }), {
    name: 'theme',
    partialize: ({ preference }) => ({ preference }),
  }),
);
