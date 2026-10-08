import { Loader2 } from 'lucide-react';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { useMe } from '@/features/auth/queries';
import { useRealtime } from '@/hooks/use-realtime';
import { useAuthStore } from '@/stores/auth-store';

/** Log-in screen without a session, the app with one. */
export function App() {
  const token = useAuthStore((state) => state.token);
  return token ? <Session /> : <AuthScreen />;
}

// A saved token is only a claim until the server has confirmed it. A rejected token logs the user
// out (see the API client); a server that cannot be reached keeps the session and offers a retry.
function Session() {
  const { data: me, isPending, isError, refetch, isFetching } = useMe();

  if (isPending && !isError) {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="bg-background flex h-dvh items-center justify-center"
      >
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }
  if (!me) {
    return (
      <div className="bg-background flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">We could not load your account.</p>
        <Button disabled={isFetching} onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return <SignedIn />;
}

function SignedIn() {
  useRealtime(); // connects while this is mounted, i.e. while there is a verified session
  return <AppShell />;
}
