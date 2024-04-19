import { ObjectId } from "mongoose";
import { Chat } from "./chat.type"
import { Message } from "./message.type";

export type ChatWithId = (Chat & { id: string })

class ChatRepo {
    private chats: ChatWithId[] = [];
    constructor() {}

    create(chat: Chat): ChatWithId {
        const newChat: ChatWithId = {id: String(this.chats.length + 1), ...chat};
        this.chats.push(newChat);
        return newChat;
    }

    findById(id: string): ChatWithId {
        return this.chats.find(chat => chat.id === id);
    }

    findByName(name: string): ChatWithId[] {
        return this.chats.filter(chat => chat.chatName.includes(name) && !chat.private);
    }

    sendMessage(id: string, message: Message): ChatWithId {
        const chat = this.findById(id);
        chat.history.push(message);
        return chat;
    }

    connectToChat(id: string, userId: ObjectId): ChatWithId {
        const chat = this.findById(id);
        if (!chat.private) {
            chat.users.push(userId);
            return chat;
        } else {
            return null;
        }
    }
}

export const ChatRepository = new ChatRepo();