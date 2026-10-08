import type { MeDto, PublicUserDto } from '@chat/shared';

import type { User } from '../../generated/prisma/client';

/** What other users may see. The last-seen time is hidden if the user asked for that. */
export function toPublicUser(
  user: User,
  context: { isOnline: boolean; isFriend: boolean },
): PublicUserDto {
  return {
    id: user.id,
    username: user.username,
    about: user.about,
    isOnline: context.isOnline,
    lastSeenAt: user.hideLastSeen ? null : user.lastSeenAt.toISOString(),
    isFriend: context.isFriend,
    allowFriendRequests: user.allowFriendRequests,
  };
}

/** What a user sees about themselves: the e-mail and the privacy settings, never the password hash. */
export function toMe(user: User): MeDto {
  return {
    id: user.id,
    username: user.username,
    about: user.about,
    lastSeenAt: user.lastSeenAt.toISOString(),
    allowFriendRequests: user.allowFriendRequests,
    email: user.email,
    hideLastSeen: user.hideLastSeen,
    hideInSearch: user.hideInSearch,
  };
}
