import { WifiOff } from 'lucide-react';

import { useChatUiStore } from '@/stores/chat-ui-store';

/** A thin bar above the app while the connection to the server is down. */
export function ConnectionBanner() {
  const connection = useChatUiStore((state) => state.connection);
  const hasBeenOnline = useChatUiStore((state) => state.hasBeenOnline);

  // The first "connecting" is just the app starting; later on it means we are reconnecting.
  const visible = connection === 'offline' || (connection === 'connecting' && hasBeenOnline);
  if (!visible) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-500/20 px-3 py-1.5 text-sm text-amber-900 dark:text-amber-200"
    >
      <WifiOff className="size-4" aria-hidden />
      Reconnecting…
    </div>
  );
}
