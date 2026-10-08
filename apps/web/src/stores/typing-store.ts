import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

/** "typing…" disappears this long after the last sign of life, which also covers a closed tab. */
export const TYPING_EXPIRES_MS = 5_000;

type TypingState = {
  /** chatId → userId → username */
  byChat: Record<string, Record<string, string>>;
  set: (chatId: string, userId: string, username: string, isTyping: boolean) => void;
  namesIn: (chatId: string) => string[];
  reset: () => void;
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const clearTimer = (key: string) => {
  clearTimeout(timers.get(key));
  timers.delete(key);
};

export const useTypingStore = create<TypingState>()((set, get) => {
  const remove = (chatId: string, userId: string) =>
    set(({ byChat }) => {
      const { [userId]: _gone, ...others } = byChat[chatId] ?? {};
      const { [chatId]: _chat, ...otherChats } = byChat;
      return {
        byChat: Object.keys(others).length ? { ...otherChats, [chatId]: others } : otherChats,
      };
    });

  return {
    byChat: {},

    set: (chatId, userId, username, isTyping) => {
      const key = `${chatId}:${userId}`;
      clearTimer(key);
      if (!isTyping) return remove(chatId, userId);

      set(({ byChat }) => ({
        byChat: { ...byChat, [chatId]: { ...byChat[chatId], [userId]: username } },
      }));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          remove(chatId, userId);
        }, TYPING_EXPIRES_MS),
      );
    },

    namesIn: (chatId) => Object.values(get().byChat[chatId] ?? {}),

    reset: () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      set({ byChat: {} });
    },
  };
});

/** The names of the people typing in a chat, for a component. */
export const useTypingNames = (chatId: string) =>
  useTypingStore(useShallow((state) => Object.values(state.byChat[chatId] ?? {})));
