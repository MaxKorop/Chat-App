import { Skeleton } from '@/components/ui/skeleton';
import { useChatUiStore } from '@/stores/chat-ui-store';

import { ChatListItem } from './ChatListItem';
import { useChats } from './queries';

/** The user's chats, with unread counts that the realtime layer keeps current. */
export function ChatList() {
  const { data: chats, isPending } = useChats();
  const activeChatId = useChatUiStore((state) => state.activeChatId);
  const openChat = useChatUiStore((state) => state.openChat);

  if (isPending) {
    return (
      <div aria-label="Loading chats" className="space-y-2 p-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (!chats?.length) {
    return (
      <p className="text-muted-foreground p-6 text-center text-sm">
        No chats yet. Search for people to add as friends, or create a chat.
      </p>
    );
  }
  return (
    <div className="space-y-0.5 p-2">
      {chats.map((chat) => (
        <ChatListItem
          key={chat.id}
          chat={chat}
          active={chat.id === activeChatId}
          onSelect={openChat}
        />
      ))}
    </div>
  );
}
