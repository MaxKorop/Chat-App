import { ChatAvatar } from '@/components/chat-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserSearch } from '@/features/users/queries';
import { useChatUiStore } from '@/stores/chat-ui-store';

import { ChatListItem } from './ChatListItem';
import { useChatSearch } from './queries';

const Loading = () => (
  <div aria-label="Searching" className="space-y-2 p-2">
    {[0, 1, 2].map((i) => (
      <Skeleton key={i} className="h-12 w-full" />
    ))}
  </div>
);
const Empty = ({ children }: { children: string }) => (
  <p className="text-muted-foreground p-6 text-center text-sm">{children}</p>
);

function ChatResults({ query, pending, onDone }: Props) {
  const { data, isFetching } = useChatSearch(query);
  const activeChatId = useChatUiStore((state) => state.activeChatId);
  const openChat = useChatUiStore((state) => state.openChat);

  if (pending || (isFetching && !data)) return <Loading />;
  if (!data?.length) return <Empty>No chats found</Empty>;
  return (
    <div className="space-y-0.5 p-2">
      {data.map((chat) => (
        <ChatListItem
          key={chat.id}
          chat={chat}
          active={chat.id === activeChatId}
          onSelect={(id) => {
            openChat(id); // a public group opens as a preview with a "Join" button
            onDone();
          }}
        />
      ))}
    </div>
  );
}

function PeopleResults({ query, pending }: Props) {
  const { data, isFetching } = useUserSearch(query);
  const showProfile = useChatUiStore((state) => state.showProfile);

  if (pending || (isFetching && !data)) return <Loading />;
  if (!data?.length) return <Empty>No people found</Empty>;
  return (
    <div className="space-y-0.5 p-2">
      {data.map((person) => (
        <button
          key={person.id}
          type="button"
          onClick={() => showProfile(person.id)}
          className="hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChatAvatar name={person.username} online={person.isOnline} className="size-10" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{person.username}</span>
            {person.about && (
              <span className="text-muted-foreground block truncate text-sm">{person.about}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

type Props = {
  /** the search text, already debounced */
  query: string;
  /** true while the user is still typing and `query` is behind */
  pending: boolean;
  onDone: () => void;
};

/** Results of the sidebar search: public groups and people. */
export function SearchResults(props: Props) {
  return (
    <Tabs defaultValue="chats" className="gap-0">
      <TabsList className="mx-2 mt-2 w-[calc(100%-1rem)]">
        <TabsTrigger value="chats">Chats</TabsTrigger>
        <TabsTrigger value="people">People</TabsTrigger>
      </TabsList>
      <TabsContent value="chats">
        <ChatResults {...props} />
      </TabsContent>
      <TabsContent value="people">
        <PeopleResults {...props} />
      </TabsContent>
    </Tabs>
  );
}
