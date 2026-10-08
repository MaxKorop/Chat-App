import { type ChatDetailsDto, formatLastSeen } from '@chat/shared';
import { ArrowLeft } from 'lucide-react';

import { ChatAvatar } from '@/components/chat-avatar';
import { Button } from '@/components/ui/button';
import { useMe } from '@/features/auth/queries';
import { useUser } from '@/features/users/queries';
import { useChatUiStore } from '@/stores/chat-ui-store';
import { useTypingNames } from '@/stores/typing-store';

/** Title and status of the open chat: who is typing, or when the other person was last seen, or how many are in the group. */
export function ChatHeader({ chat }: { chat: ChatDetailsDto }) {
  const { data: me } = useMe();
  const typing = useTypingNames(chat.id);
  const openChat = useChatUiStore((state) => state.openChat);
  const setDialog = useChatUiStore((state) => state.setDialog);

  const otherId =
    chat.type === 'DIRECT' && me
      ? (chat.members.find((m) => m.userId !== me.id)?.userId ?? null)
      : null;
  const { data: other } = useUser(otherId);

  const status = typing.length
    ? `${typing.join(', ')} ${typing.length === 1 ? 'is' : 'are'} typing…`
    : chat.type === 'DIRECT'
      ? other && formatLastSeen(other)
      : `${chat.members.length} ${chat.members.length === 1 ? 'member' : 'members'}`;

  return (
    <header className="flex items-center gap-3 border-b px-3 py-2">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Back to chats"
        onClick={() => openChat(null)}
      >
        <ArrowLeft />
      </Button>
      <ChatAvatar name={chat.title} online={other?.isOnline} className="size-10" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold">
          <button
            type="button"
            className="hover:underline focus-visible:underline focus-visible:outline-none"
            onClick={() => setDialog('chatInfo')}
          >
            {chat.title}
          </button>
        </h2>
        <p
          className={
            typing.length
              ? 'text-primary truncate text-sm'
              : 'text-muted-foreground truncate text-sm'
          }
        >
          {status}
        </p>
      </div>
    </header>
  );
}
