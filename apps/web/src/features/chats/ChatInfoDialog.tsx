import { formatDateTime } from '@chat/shared';

import { ChatAvatar } from '@/components/chat-avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatUiStore } from '@/stores/chat-ui-store';

import { useChat } from './queries';

/** Description, creation date and members of the open chat. */
export function ChatInfoDialog() {
  const activeChatId = useChatUiStore((state) => state.activeChatId);
  const open = useChatUiStore((state) => state.dialog === 'chatInfo');
  const setDialog = useChatUiStore((state) => state.setDialog);
  const showProfile = useChatUiStore((state) => state.showProfile);
  const { data: chat } = useChat(open ? activeChatId : null);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => setDialog(isOpen ? 'chatInfo' : null)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{chat?.title ?? 'Chat'}</DialogTitle>
          <DialogDescription>
            {chat ? `Created ${formatDateTime(chat.createdAt)}` : 'Loading…'}
          </DialogDescription>
        </DialogHeader>
        {!chat ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            {chat.description && <p className="text-sm">{chat.description}</p>}
            <section className="space-y-1">
              <h3 className="text-sm font-medium">
                {chat.members.length === 1 ? '1 member' : `${chat.members.length} members`}
              </h3>
              <ul className="space-y-0.5">
                {chat.members.map((member) => (
                  <li key={member.userId}>
                    <button
                      type="button"
                      onClick={() => showProfile(member.userId)}
                      className="hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <ChatAvatar name={member.username} className="size-8" />
                      <span className="flex-1 truncate">{member.username}</span>
                      {member.role === 'OWNER' && <Badge variant="secondary">Owner</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
