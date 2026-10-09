import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useApplyTheme } from '@/hooks/use-theme';
import { queryClient } from '@/lib/query-client';

/** Everything the components share: server data, the theme, tooltips and toasts. */
export function Providers({ children }: { children: ReactNode }) {
  const theme = useApplyTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster theme={theme} position="top-center" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
