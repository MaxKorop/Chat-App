import { IsArray, IsNotEmpty, IsString, Length } from "class-validator";
import { ObjectId } from "mongoose";
import { Message } from "../message.type";
import { Transform } from "class-transformer";

export class CreateChatDto {
    id: string

    @IsNotEmpty()
    @IsArray()
    users: ObjectId[] // Users

    @IsNotEmpty()
    @Length(3, 25)
    chatName: string | null // Group | PrivateChata

    @Transform(({ value }) => (value === undefined ? "" : value))
    details: string; // About chat
    
    @Transform(({ value }) => (value === undefined ? false : value))
    private: Boolean; // If group 'true' or 'false', if PrivateChat always false
    
    @Transform(({ value }) => (value === undefined ? [] : value))
    history: Message[]; // Messages
    
    @Transform(({ value }) => (value === undefined ? new Date() : value))
    createdAt: Date;
}