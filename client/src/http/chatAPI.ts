import { Chat, Image, MessageError } from "../types/types";
import { $authHost } from ".";

type CreateChatType = {
    'users': string[]
    'chatName': string | null,
    'details': string | null,
    'privateChat': boolean,
    'public': boolean,
}

export const createChat = async (chat: CreateChatType): Promise<Chat> => {
    try {
        if (chat.privateChat) {
            chat = {
                ...chat,
                chatName: null,
                details: null
            }
        }
        const { data }: { data: Chat } = await $authHost.post('/chat/create', { ...chat });
        return data;
    } catch (error: any) {
        console.error(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}

export const searchController = new AbortController();

export const searchChats = async (name: string) => {
    try {
        const { data }: { data: Chat[] } = await $authHost.get('/chat/search', { signal: searchController.signal, params: { chatName: name } });
        return data;
    } catch (error: any) {
        console.error(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}

export const getUserChats = async () => {
    try {
        const { data }: { data: Chat[] } = await $authHost.get('/chat/user');
        return data;
    } catch (error: any) {
        console.error(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}

export const joinChat = async (chatId: string): Promise<Chat | null> => {
    try {
        const { data }: { data: Chat } = await $authHost.post('/chat/join', { chatId });
        return data;
    } catch (error: any) {
        console.error(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}

export const uploadImages = async (images: FormData) => {
    try {
        const { data }: { data: string[] } = await $authHost.post('/image/upload', images);
        return data;
    } catch (error: any) {
        console.error(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}

export const getImages = async (id: string[]) => {
    try {
        const { data }: { data: Image[] } = await $authHost.get('/image', { params: { id } });
        return data;
    } catch (error: any) {
        console.error(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}