import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { userKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';

import { getMe, logIn, type Session, signUp } from './api';

/** The logged-in user. Only asks while there is a token. */
export const useMe = () => {
  const token = useAuthStore((state) => state.token);
  return useQuery({ queryKey: userKeys.me, queryFn: getMe, enabled: !!token });
};

// Logging in and signing up end the same way: cache the user that came back, and remember the token.
function useSessionMutation<Input>(request: (input: Input) => Promise<Session>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (session) => {
      qc.setQueryData(userKeys.me, session.user);
      useAuthStore.getState().setToken(session.accessToken);
    },
  });
}

export const useLogIn = () => useSessionMutation(logIn);
export const useSignUp = () => useSessionMutation(signUp);
