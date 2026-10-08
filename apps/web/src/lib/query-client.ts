import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// One place shows every failure. `id` makes sonner replace an identical toast instead of stacking
// three of them when a dropped connection fails three requests at once.
const showError = (error: Error) => toast.error(error.message, { id: error.message });

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  queryCache: new QueryCache({ onError: showError }),
  mutationCache: new MutationCache({ onError: showError }),
});
