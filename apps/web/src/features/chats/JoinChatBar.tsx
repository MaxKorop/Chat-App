import { Button } from '@/components/ui/button';

import { useJoinChat } from './queries';

/** Shown instead of the composer when looking at a public group one has not joined. */
export function JoinChatBar({ chatId }: { chatId: string }) {
  const join = useJoinChat();
  return (
    <div className="flex items-center justify-between gap-3 border-t p-3">
      <p className="text-muted-foreground text-sm">Join to see the messages and write here.</p>
      <Button disabled={join.isPending} onClick={() => join.mutate(chatId)}>
        {join.isPending ? 'Joining…' : 'Join group'}
      </Button>
    </div>
  );
}
