import { getInitials } from '@chat/shared';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/** Initials in a circle, with a green dot when the person is online. */
export function ChatAvatar({
  name,
  online = false,
  className,
}: {
  name: string;
  online?: boolean;
  className?: string;
}) {
  return (
    <div className="relative shrink-0">
      <Avatar className={className}>
        <AvatarFallback>{getInitials(name)}</AvatarFallback>
      </Avatar>
      {online && (
        <span
          role="img"
          aria-label="online"
          className={cn(
            'absolute right-0 bottom-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background',
          )}
        />
      )}
    </div>
  );
}
