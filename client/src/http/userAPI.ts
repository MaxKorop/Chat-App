import { $authHost, $host } from ".";
import { jwtDecode } from "jwt-decode";
import { MessageError, UpdateUser, User } from "../types/types";

export const logIn = async (userName: string, password: string) => {
    try{
        const { data }: { data: { token: string, error?: string, message?: string, statusCode?: number } } = await $host.post('/user/logIn', { userName, password });
        localStorage.setItem('token', `Bearer ${data.token}`);
        return jwtDecode(data.token) as User;
    }
    catch (error: any) {
        console.error(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}

export const signUp = async (userName: string, password: string, email: string) => {
    try {
        const { data }: { data: { token: string, error?: string, message?: string, statusCode?: number } } = await $host.post('/user/signUp', { userName, password, email });
        localStorage.setItem('token', `Bearer ${data.token}`);
        return jwtDecode(data.token) as User;
    }
    catch (error: any) {
        console.log(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}

export const check = async () => {
    try {
        const { data }: { data: { token: string, error?: string, message?: string, statusCode?: number } } = await $authHost.post('/user/check');
        localStorage.setItem('token', `Bearer ${data.token}`);
        return jwtDecode(data.token) as User;
    } catch (error: any) {
        console.log(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}

export const joinUserToChat = async (chatId: string) => {
    try {
        const { data }: { data: { token: string, error?: string, message?: string, statusCode?: number } } = await $authHost.post('/user/joinToChat', { chatId });
        localStorage.setItem('token', `Bearer ${data.token}`);
        return jwtDecode(data.token) as User;
    } catch (error: any) {
        console.log(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}

export const getOneUser = async (id: string): Promise<string | null> => {
    try {
        const { data }: { data: string } = await $authHost.get('user/userInfo', { params: { id } });
        return data;
    } catch (error: any) {
        console.log(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}

export const searchUsers = async (userName: string) => {
    try {
        const { data }: { data: User[] } = await $authHost.post('/user/search', { userName });
        return data;
    } catch (error: any) {
        console.log(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}

export const addToFriends = async (userId: string) => {
    try {
        const { data }: { data: { token: string, error?: string, message?: string, statusCode?: number } } = await $authHost.post('/user/addFriend', { userId });
        localStorage.setItem('token', `Bearer ${data.token}`);
        return jwtDecode(data.token) as User;
    } catch (error: any) {
        console.log(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}

export const getFriends = async () => {
    try {
        const { data }: { data: User[] } = await $authHost.get('/user/friends');
        return data as User[];
    } catch (error: any) {
        console.log(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}

export const updateUser = async (user: UpdateUser) => {
    try {
        const { data }: { data: { token: string, error?: string, message?: string, statusCode?: number } } = await $authHost.put('user/update', user);
        localStorage.setItem('token', data.token);
        return jwtDecode(data.token) as User;
    } catch (error: any) {
        console.log(error.response.data.message);
        throw new MessageError(error.response.data.message);
    }
}