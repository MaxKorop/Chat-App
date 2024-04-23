import { IsArray, IsNotEmpty, Length } from "class-validator";
import { ObjectId } from "mongoose";
import { Message } from "../message.type";
import { Optional } from "@nestjs/common";

export class CreateChatDto {
    _id: string

    @IsNotEmpty()
    @IsArray()
    users: ObjectId[] // Users

    @Optional()
    @Length(3, 25)
    chatName: string | null

    details: string; // About chat
    
    private: boolean; // If group 'true' or 'false', if PrivateChat always false

    public: boolean;
    
    history: Message[]; // Messages
    
    createdAt: Date;

    constructor(
        users: ObjectId[],
        chatName: string | null,
        history?: Message[],
        details?: string,
        privateChat?: boolean,
        publicChat?: boolean,
        createdAt?: Date
    ) {
        this.users = users;
        this.chatName = chatName || null;
        this.history = history || [];
        this.details = details || "";
        this.private = privateChat || false;
        this.public = publicChat || true;
        this.createdAt = createdAt || new Date();
    }
}