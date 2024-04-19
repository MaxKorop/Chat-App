import axios from "axios";

export const searchChats = async (name: string): Promise<[]> => {
    const { data } = await axios.get(`http://localhost:5000/api/chat/${name}`);
    return data;
}