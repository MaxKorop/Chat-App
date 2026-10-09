import { Plus, Settings } from 'lucide-react';
import { useState } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { ChatAvatar } from '@/components/chat-avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMe } from '@/features/auth/queries';
import { ChatList } from '@/features/chats/ChatList';
import { SearchResults } from '@/features/chats/SearchResults';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';
import { useChatUiStore } from '@/stores/chat-ui-store';

/** The left column: search, my chats (or search results), and who I am. */
export function Sidebar({ className }: { className?: string }) {
  const [text, setText] = useState('');
  const query = useDebouncedValue(text, 300); // search when typing pauses, not on every key
  const setDialog = useChatUiStore((state) => state.setDialog);
  const { data: me } = useMe();
  const searching = text.trim().length > 0;

  // Whatever opens a chat (a result, a profile's "Message" button) ends the search. Adjusting state
  // while rendering is React's way to reset state when a value changes, without an effect.
  const activeChatId = useChatUiStore((state) => state.activeChatId);
  const [seenChatId, setSeenChatId] = useState(activeChatId);
  if (activeChatId !== seenChatId) {
    setSeenChatId(activeChatId);
    if (activeChatId) setText('');
  }

  return (
    <aside
      className={cn('flex h-full flex-col border-r bg-sidebar text-sidebar-foreground', className)}
    >
      <header className="flex items-center gap-2.5 px-4 pt-4">
        <BrandMark className="size-8 shrink-0" />
        <h1 className="text-lg font-bold tracking-tight">Chat</h1>
      </header>
      <div className="flex items-center gap-2 p-3">
        <Input
          type="search"
          aria-label="Search"
          placeholder="Search chats and people"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <Button
          variant="secondary"
          size="icon"
          aria-label="New chat"
          onClick={() => setDialog('createChat')}
        >
          <Plus />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {searching ? (
          <SearchResults
            query={query}
            pending={text.trim() !== query.trim()}
            onDone={() => setText('')}
          />
        ) : (
          <ChatList />
        )}
      </ScrollArea>

      <footer className="flex items-center gap-3 border-t p-3">
        {me && <ChatAvatar name={me.username} className="size-8" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{me?.username}</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Settings"
          onClick={() => setDialog('settings')}
        >
          <Settings />
        </Button>
      </footer>
    </aside>
  );
}
