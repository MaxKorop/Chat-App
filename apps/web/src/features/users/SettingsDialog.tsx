import { formatLastSeen, type MeDto, type UpdateMeInput, updateMeSchema } from '@chat/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserMinus } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';

import { ChatAvatar } from '@/components/chat-avatar';
import { Button } from '@/components/ui/button';
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useMe } from '@/features/auth/queries';
import { useAuthStore } from '@/stores/auth-store';
import { useChatUiStore } from '@/stores/chat-ui-store';

import { AppearancePicker } from './AppearancePicker';
import { useFriends, useRemoveFriend, useUpdateMe } from './queries';

type FormValues = z.input<typeof updateMeSchema>;

const PRIVACY: {
  name: 'hideInSearch' | 'hideLastSeen' | 'allowFriendRequests';
  label: string;
  hint: string;
}[] = [
  { name: 'hideInSearch', label: 'Hide me from search', hint: 'People cannot find you by name' },
  {
    name: 'hideLastSeen',
    label: 'Hide my last seen time',
    hint: 'Others see "last seen recently"',
  },
  {
    name: 'allowFriendRequests',
    label: 'Allow friend requests',
    hint: 'Others can add you as a friend',
  },
];

function ProfileForm({ me }: { me: MeDto }) {
  const update = useUpdateMe();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues, unknown, UpdateMeInput>({
    resolver: zodResolver(updateMeSchema),
    defaultValues: {
      username: me.username,
      about: me.about,
      hideInSearch: me.hideInSearch,
      hideLastSeen: me.hideLastSeen,
      allowFriendRequests: me.allowFriendRequests,
    },
  });

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) =>
        update.mutate(values, {
          onSuccess: (saved) => reset({ ...values, username: saved.username }),
        }),
      )}
    >
      <FieldGroup>
        <Field data-invalid={!!errors.username}>
          <FieldLabel htmlFor="settings-username">Username</FieldLabel>
          <Input
            id="settings-username"
            aria-invalid={!!errors.username}
            {...register('username')}
          />
          <FieldError errors={[errors.username]} />
        </Field>
        <Field data-invalid={!!errors.about}>
          <FieldLabel htmlFor="settings-about">About me</FieldLabel>
          <Textarea
            id="settings-about"
            rows={2}
            aria-invalid={!!errors.about}
            {...register('about')}
          />
          <FieldError errors={[errors.about]} />
        </Field>
        <p className="text-muted-foreground text-sm">
          Email: <span className="text-foreground">{me.email}</span>
        </p>
        {PRIVACY.map(({ name, label, hint }) => (
          <Field key={name} orientation="horizontal">
            <div className="flex-1">
              <Label htmlFor={`settings-${name}`}>{label}</Label>
              <FieldDescription>{hint}</FieldDescription>
            </div>
            <Controller
              control={control}
              name={name}
              render={({ field }) => (
                <Switch
                  id={`settings-${name}`}
                  checked={!!field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </Field>
        ))}
        <Button type="submit" disabled={!isDirty || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </FieldGroup>
    </form>
  );
}

function Friends() {
  const { data: friends } = useFriends();
  const remove = useRemoveFriend();
  if (!friends?.length) return <p className="text-muted-foreground text-sm">No friends yet.</p>;
  return (
    <ul className="max-h-48 space-y-1 overflow-y-auto">
      {friends.map((friend) => (
        <li key={friend.id} className="flex items-center gap-3 px-1 py-1">
          <ChatAvatar name={friend.username} online={friend.isOnline} className="size-8" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{friend.username}</p>
            <p className="text-muted-foreground truncate text-xs">{formatLastSeen(friend)}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${friend.username} from friends`}
            onClick={() => remove.mutate(friend.id)}
          >
            <UserMinus />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Profile, privacy, friends and log out. */
export function SettingsDialog() {
  const open = useChatUiStore((state) => state.dialog === 'settings');
  const setDialog = useChatUiStore((state) => state.setDialog);
  const { data: me } = useMe();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => setDialog(isOpen ? 'settings' : null)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Your profile and privacy</DialogDescription>
        </DialogHeader>
        {me ? <ProfileForm me={me} /> : <Skeleton className="h-40 w-full" />}
        <Separator />
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Appearance</h3>
          <AppearancePicker />
        </section>
        <Separator />
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Friends</h3>
          <Friends />
        </section>
        <Separator />
        <Button variant="destructive" onClick={() => useAuthStore.getState().logout()}>
          Log out
        </Button>
      </DialogContent>
    </Dialog>
  );
}
