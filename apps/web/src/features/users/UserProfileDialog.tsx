import { formatLastSeen } from '@chat/shared';

import { ChatAvatar } from '@/components/chat-avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/features/auth/queries';
import { useCreateChat } from '@/features/chats/queries';
import { useChatUiStore } from '@/stores/chat-ui-store';

import { useAddFriend, useRemoveFriend, useUser } from './queries';

function Profile({ userId }: { userId: string }) {
  const { data: person } = useUser(userId);
  const { data: me } = useMe();
  const addFriend = useAddFriend();
  const removeFriend = useRemoveFriend();
  const createChat = useCreateChat();
  const openChat = useChatUiStore((state) => state.openChat);
  const showProfile = useChatUiStore((state) => state.showProfile);

  if (!person) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>Loading…</DialogDescription>
        </DialogHeader>
        <Skeleton className="h-16 w-full" />
      </>
    );
  }

  const isMe = person.id === me?.id;
  async function message() {
    const chat = await createChat.mutateAsync({ type: 'DIRECT', userId });
    openChat(chat.id);
    showProfile(null);
  }

  return (
    <>
      <DialogHeader className="flex-row items-center gap-3 text-left">
        <ChatAvatar name={person.username} online={person.isOnline} className="size-14" />
        <div className="min-w-0">
          <DialogTitle>{person.username}</DialogTitle>
          <DialogDescription>{formatLastSeen(person)}</DialogDescription>
        </div>
      </DialogHeader>
      {person.about && <p className="text-sm">{person.about}</p>}

      {!isMe && (
        <div className="flex flex-col gap-2 pt-2">
          {person.isFriend ? (
            <div className="flex gap-2">
              <Button className="flex-1" disabled={createChat.isPending} onClick={message}>
                Message
              </Button>
              <Button
                variant="destructive"
                disabled={removeFriend.isPending}
                onClick={() => removeFriend.mutate(person.id)}
              >
                Remove friend
              </Button>
            </div>
          ) : (
            <>
              <Button
                disabled={!person.allowFriendRequests || addFriend.isPending}
                onClick={() => addFriend.mutate(person.id)}
              >
                Add friend
              </Button>
              {!person.allowFriendRequests && (
                <p className="text-muted-foreground text-sm">
                  {person.username} does not accept friend requests.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

/** Someone's profile, opened from search results or from a chat. */
export function UserProfileDialog() {
  const userId = useChatUiStore((state) => state.profileUserId);
  const showProfile = useChatUiStore((state) => state.showProfile);

  return (
    <Dialog open={!!userId} onOpenChange={(isOpen) => !isOpen && showProfile(null)}>
      <DialogContent className="sm:max-w-sm">{userId && <Profile userId={userId} />}</DialogContent>
    </Dialog>
  );
}
