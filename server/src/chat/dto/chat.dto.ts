import { IsArray, IsNotEmpty, IsString, Length, ValidateIf } from "class-validator";
import { ObjectId } from "mongoose";
import { Message } from "../message.type";

export class CreateChatDto {
    _id: string

    @IsNotEmpty()
    @IsArray()
    users: ObjectId[] // Users

    @IsString()
    @Length(3, 25)
    @ValidateIf((obj) => obj.chatName !== null && obj.chatName !== '')
    chatName: string | null

    details: string; // About chat
    
    private: boolean; // If group 'true' or 'false', if PrivateChat always false

    public: boolean;
    
    history: Message[]; // Messages
    
    createdAt: Date;

    constructor(
        users: ObjectId[],
        chatName: string | null,
        privateChat?: boolean,
        publicChat?: boolean,
        details?: string,
        history?: Message[],
        createdAt?: Date
    ) {
        this.users = users;
        this.chatName = chatName || null;
        this.history = history || [];
        this.details = details || "";
        this.private = privateChat;
        this.public = publicChat || true;
        this.createdAt = createdAt || new Date();
    }
}

export class JoinChatDto {
    chatId: string
}