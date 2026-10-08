import type { ChatSummaryDto } from '@chat/shared';
import { Globe } from 'lucide-react';

import { ChatAvatar } from '@/components/chat-avatar';
import { Badge } from '@/components/ui/badge';
import { formatListTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useTypingNames } from '@/stores/typing-store';

type Props = { chat: ChatSummaryDto; active: boolean; onSelect: (chatId: string) => void };

/** One row of the chat list. */
export function ChatListItem({ chat, active, onSelect }: Props) {
  const typing = useTypingNames(chat.id);
  const preview = typing.length
    ? `${typing.join(', ')} ${typing.length === 1 ? 'is' : 'are'} typing…`
    : (chat.lastMessage?.preview ?? 'No messages yet');

  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      onClick={() => onSelect(chat.id)}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        active && 'bg-accent',
      )}
    >
      <ChatAvatar name={chat.title} className="size-10" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{chat.title}</span>
          {chat.type === 'GROUP' && chat.isPublic && (
            <Globe aria-label="Public group" className="text-muted-foreground size-3.5 shrink-0" />
          )}
          {chat.lastMessage && (
            <time
              dateTime={chat.lastMessage.createdAt}
              className="text-muted-foreground ml-auto shrink-0 text-xs"
            >
              {formatListTime(chat.lastMessage.createdAt)}
            </time>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-sm text-muted-foreground',
              typing.length > 0 && 'text-primary',
              !chat.lastMessage && !typing.length && 'italic',
            )}
          >
            {preview}
          </span>
          {chat.unreadCount > 0 && (
            <Badge
              aria-label={`${chat.unreadCount} unread messages`}
              className="ml-auto shrink-0 rounded-full px-1.5"
            >
              {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
            </Badge>
          )}
        </span>
      </span>
    </button>
  );
}
