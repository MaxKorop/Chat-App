import { format, formatDistanceToNow } from 'date-fns';

export const formatTime = (iso: string) => format(new Date(iso), 'HH:mm');

export const formatDateTime = (iso: string) => format(new Date(iso), 'dd.MM.yyyy HH:mm');

export const formatLastSeen = (user: { isOnline: boolean; lastSeenAt: string | null }) => {
  if (user.isOnline) return 'online';
  if (!user.lastSeenAt) return 'last seen recently';
  return `last seen ${formatDistanceToNow(new Date(user.lastSeenAt), { addSuffix: true })}`;
};
