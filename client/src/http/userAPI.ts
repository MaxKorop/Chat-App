import { $authHost, $host } from ".";
import { jwtDecode } from "jwt-decode";
import { User } from "../types/types";

export const logIn = async (userName: string, password: string) => {
    try{
        const { data }: { data: { token: string, error?: string, message?: string, statusCode?: number } } = await $host.post('/user/logIn', { userName, password });
        localStorage.setItem('token', `Bearer ${data.token}`);
        return jwtDecode(data.token) as User;
    }
    catch (error: any) {
        console.error(error.response.data.message);
        return null;
    }
}

export const signUp = async (userName: string, password: string, email: string) => {
    try {
        const { data }: { data: { token: string, error?: string, message?: string, statusCode?: number } } = await $host.post('/user/signUp', { userName, password, email });
        localStorage.setItem('token', `Bearer ${data.token}`);
        return jwtDecode(data.token) as User;
    }
    catch (error: any) {
        console.error(error.response.data.message);
        return null;
    }
}

export const check = async () => {
    try {
        const { data }: { data: { token: string, error?: string, message?: string, statusCode?: number } } = await $authHost.post('/user/check');
        localStorage.setItem('token', `Bearer ${data.token}`);
        return jwtDecode(data.token) as User;
    } catch (error: any) {
        console.error(error.response.data.message);
        return null;
    }
}

export const joinUserToChat = async (chatId: string) => {
    try {
        const { data }: { data: { token: string, error?: string, message?: string, statusCode?: number } } = await $authHost.post('/user/joinToChat', { chatId });
        localStorage.setItem('token', `Bearer ${data.token}`);
        return jwtDecode(data.token) as User;
    } catch (error: any) {
        console.error(error.response.data.message);
        return null;
    }
}