import { MessageSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/features/auth/queries';
import { MessageComposer } from '@/features/messages/MessageComposer';
import { MessageList } from '@/features/messages/MessageList';
import { useChatUiStore } from '@/stores/chat-ui-store';

import { ChatHeader } from './ChatHeader';
import { JoinChatBar } from './JoinChatBar';
import { useChat } from './queries';

/** The right side: the open chat, or a hint to open one. */
export function ChatView() {
  const activeChatId = useChatUiStore((state) => state.activeChatId);
  const openChat = useChatUiStore((state) => state.openChat);
  const { data: me } = useMe();
  const { data: chat, isPending, isError } = useChat(activeChatId);

  if (!activeChatId) {
    return (
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3">
        <MessageSquare className="size-12 opacity-40" />
        <p>Select a chat to start messaging</p>
      </div>
    );
  }
  if (isPending || !me) {
    return (
      <div aria-label="Loading chat" className="flex flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="mt-auto h-10 w-1/2" />
      </div>
    );
  }
  if (isError || !chat) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-muted-foreground">This chat is not available.</p>
        <Button variant="outline" onClick={() => openChat(null)}>
          Back to chats
        </Button>
      </div>
    );
  }

  return (
    <>
      <ChatHeader chat={chat} />
      {chat.isMember ? (
        <>
          <MessageList key={`list-${chat.id}`} chat={chat} myId={me.id} />
          <MessageComposer key={`composer-${chat.id}`} chatId={chat.id} />
        </>
      ) : (
        <>
          <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            {chat.description && <p>{chat.description}</p>}
            <p>This is a public group. Join it to read and write messages.</p>
          </div>
          <JoinChatBar chatId={chat.id} />
        </>
      )}
    </>
  );
}
