import { Chat } from "../types/types";
import { $authHost } from ".";

export const searchController = new AbortController();

export const searchChats = async (name: string): Promise<Chat[]> => {
    const { data }: { data: Chat[] } = await $authHost.get('/chat/search', { signal: searchController.signal, params: { chatName: name } });
    return data;
}

export const getUserChats = async () => {
    const { data }: { data: Chat[] } = await $authHost.get('/chat/user');
    return data;
}

export const createChat = async ({name, details, history=[], users=[] }: {name: string, details: string, history: [], users: []}): Promise<Chat> => {
    const chat = {
        chatName: name,
        details,
        history,
        users
    };
    const { data }: { data: Chat } = await $authHost.post('/chat/create', { ...chat });
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