import { Chat } from "../types/types";
import { $authHost } from ".";

export const searchChats = async (name: string): Promise<Chat[]> => {
    const { data }: { data: Chat[] } = await $authHost.get(`/chat`, { params: { chatName: name } });
    return data;
}

export const createChat = async ({name, details, history=[], users=[] }: {name: string, details: string, history: [], users: []}): Promise<Chat> => {
    const chat = {
        chatName: name,
        details,
        history,
        users
    };
    const { data }: { data: Chat } = await $authHost.post('/chat', { ...chat });
    return data;
}