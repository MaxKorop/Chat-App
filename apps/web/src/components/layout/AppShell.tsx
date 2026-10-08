import { ChatInfoDialog } from '@/features/chats/ChatInfoDialog';
import { ChatView } from '@/features/chats/ChatView';
import { CreateChatDialog } from '@/features/chats/CreateChatDialog';
import { SettingsDialog } from '@/features/users/SettingsDialog';
import { UserProfileDialog } from '@/features/users/UserProfileDialog';
import { cn } from '@/lib/utils';
import { useChatUiStore } from '@/stores/chat-ui-store';

import { ConnectionBanner } from './ConnectionBanner';
import { Sidebar } from './Sidebar';

/**
 * The signed-in layout. From the md breakpoint up the list and the chat sit side by side; on a
 * phone only one of them is shown, depending on whether a chat is open.
 */
export function AppShell() {
  const chatIsOpen = useChatUiStore((state) => state.activeChatId !== null);

  return (
    <div className="bg-background text-foreground flex h-dvh flex-col">
      <ConnectionBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          className={cn(
            'w-full md:flex md:w-80 md:shrink-0 lg:w-96',
            chatIsOpen ? 'hidden' : 'flex',
          )}
        />
        <main className={cn('min-w-0 flex-1 flex-col md:flex', chatIsOpen ? 'flex' : 'hidden')}>
          <ChatView />
        </main>
      </div>
      <CreateChatDialog />
      <SettingsDialog />
      <ChatInfoDialog />
      <UserProfileDialog />
    </div>
  );
}
