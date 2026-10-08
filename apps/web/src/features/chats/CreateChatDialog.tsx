import { type ChatDetailsDto, createChatSchema } from '@chat/shared';
import { useState } from 'react';

import { ChatAvatar } from '@/components/chat-avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFriends } from '@/features/users/queries';
import { useChatUiStore } from '@/stores/chat-ui-store';

import { useCreateChat } from './queries';

function useAfterCreate() {
  const openChat = useChatUiStore((state) => state.openChat);
  const setDialog = useChatUiStore((state) => state.setDialog);
  return (chat: ChatDetailsDto) => {
    openChat(chat.id);
    setDialog(null);
  };
}

function DirectTab() {
  const { data: friends, isPending } = useFriends();
  const create = useCreateChat();
  const afterCreate = useAfterCreate();

  if (isPending)
    return <p className="text-muted-foreground py-6 text-center text-sm">Loading friends…</p>;
  if (!friends?.length) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        You have no friends yet. Search for people and add them first.
      </p>
    );
  }
  return (
    <ul className="max-h-72 space-y-0.5 overflow-y-auto">
      {friends.map((friend) => (
        <li key={friend.id}>
          <button
            type="button"
            disabled={create.isPending}
            onClick={async () =>
              afterCreate(await create.mutateAsync({ type: 'DIRECT', userId: friend.id }))
            }
            className="hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          >
            <ChatAvatar name={friend.username} online={friend.isOnline} className="size-9" />
            <span className="truncate font-medium">{friend.username}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function GroupTab() {
  const { data: friends } = useFriends();
  const create = useCreateChat();
  const afterCreate = useAfterCreate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string, checked: boolean) =>
    setMemberIds((ids) => (checked ? [...ids, id] : ids.filter((other) => other !== id)));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // the same rules the server applies
    const parsed = createChatSchema.safeParse({
      type: 'GROUP',
      name,
      description: description.trim() || undefined,
      isPublic,
      memberIds,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the form');
    setError(null);
    afterCreate(await create.mutateAsync(parsed.data));
  }

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="group-name">Name</FieldLabel>
          <Input
            id="group-name"
            value={name}
            aria-invalid={!!error}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldError>{error}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="group-description">Description</FieldLabel>
          <Input
            id="group-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field orientation="horizontal">
          <div className="flex-1">
            <Label htmlFor="group-public">Public</Label>
            <FieldDescription>Anyone can find it by name and join</FieldDescription>
          </div>
          <Switch id="group-public" checked={isPublic} onCheckedChange={setIsPublic} />
        </Field>
        {!!friends?.length && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Add friends</legend>
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {friends.map((friend) => (
                <li key={friend.id} className="flex items-center gap-2 px-1">
                  <Checkbox
                    id={`member-${friend.id}`}
                    checked={memberIds.includes(friend.id)}
                    onCheckedChange={(checked) => toggle(friend.id, checked === true)}
                  />
                  <Label htmlFor={`member-${friend.id}`} className="flex-1 cursor-pointer py-1">
                    {friend.username}
                  </Label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <Button type="submit" size="lg" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create group'}
        </Button>
      </FieldGroup>
    </form>
  );
}

/** "New chat": a direct chat with a friend, or a group. */
export function CreateChatDialog() {
  const open = useChatUiStore((state) => state.dialog === 'createChat');
  const setDialog = useChatUiStore((state) => state.setDialog);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => setDialog(isOpen ? 'createChat' : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
          <DialogDescription>Talk to one friend, or create a group</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="direct">
          <TabsList className="w-full">
            <TabsTrigger value="direct">Direct</TabsTrigger>
            <TabsTrigger value="group">Group</TabsTrigger>
          </TabsList>
          <TabsContent value="direct" className="pt-3">
            <DirectTab />
          </TabsContent>
          <TabsContent value="group" className="pt-3">
            <GroupTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
