import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { userKeys } from '@/lib/query-keys';

import { addFriend, getFriends, getUser, removeFriend, searchUsers, updateMe } from './api';

export const useUserSearch = (query: string) => {
  const q = query.trim();
  return useQuery({
    queryKey: userKeys.search(q),
    queryFn: ({ signal }) => searchUsers(q, signal), // a search that is no longer wanted is cancelled
    enabled: q.length > 0,
  });
};

export const useUser = (userId: string | null) =>
  useQuery({
    queryKey: userKeys.detail(userId ?? ''),
    queryFn: () => getUser(userId!),
    enabled: !!userId,
  });

export const useFriends = () => useQuery({ queryKey: userKeys.friends, queryFn: getFriends });

export const useUpdateMe = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    onSuccess: (me) => qc.setQueryData(userKeys.me, me),
  });
};

// "is friend" is shown in search results and profiles, so friend changes refresh all of them.
function useFriendMutation(request: (userId: string) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: userKeys.friends }),
        qc.invalidateQueries({ queryKey: userKeys.all }),
      ]),
  });
}
export const useAddFriend = () => useFriendMutation(addFriend);
export const useRemoveFriend = () => useFriendMutation(removeFriend);
