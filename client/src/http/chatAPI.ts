import { Chat } from "../types/types";
import { $authHost } from ".";

type CreateChatType = {
    'users': string[]
    'chatName': string | null,
    'details': string | null,
    'private': boolean,
    'public': boolean,
}

export const createChat = async (chat: CreateChatType): Promise<Chat> => {
    if (chat.private) {
        chat = {
            ...chat,
            chatName: null,
            details: null
        }
    }
    const { data }: { data: Chat } = await $authHost.post('/chat/create', { ...chat });
    return data;
}

export const searchController = new AbortController();

export const searchChats = async (name: string): Promise<Chat[]> => {
    const { data }: { data: Chat[] } = await $authHost.get('/chat/search', { signal: searchController.signal, params: { chatName: name } });
    return data;
}

export const getUserChats = async () => {
    const { data }: { data: Chat[] } = await $authHost.get('/chat/user');
    return data;
}

export const joinChat = async (chatId: string): Promise<Chat | null> => {
    try {
        const { data }: { data: Chat } = await $authHost.post('/chat/join', { chatId });
        return data;
    } catch (error: any) {
        console.error(error.response.data.message);
        return null;
    }
}