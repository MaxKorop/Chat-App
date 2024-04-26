import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional } from "class-validator";
import { Schema } from "mongoose"

export class CreateMessageDto {

    @IsOptional()
    @Transform(({ value }) => (value === undefined ? "Text" : value))
    type: "Text" | "Image" | "GIF" | "Video"; // Type for message
    
    @Transform(({ value }) => (value === undefined ? "Sent" : value))
    status: "Sent" | "Read"; 

    @IsNotEmpty()
    payload: string; // Message information

    @IsOptional()
    media: Buffer; // If message.type == Image | GIF | Video

    @IsNotEmpty()
    sentBy: Schema.Types.ObjectId; // User

    @IsNotEmpty()
    sentByName: string

    @IsOptional()
    repliedTo: Schema.Types.ObjectId; // Message

    @IsOptional()
    @Transform(({ value }) => (value === undefined ? new Date() : value))
    sentAt: Date; // Date

    @IsOptional()
    modified: Boolean;

    @IsOptional()
    translatedFrom: Schema.Types.ObjectId; // User

    constructor(
        payload: string,
        sentBy: Schema.Types.ObjectId,
        sentByName: string,
        type?: "Text" | "Image" | "GIF" | "Video",
        status?: "Sent" | "Read",
        media: Buffer = null,
        repliedTo?: Schema.Types.ObjectId,
        sentAt?: Date,
        modified?: Boolean,
        translatedFrom?: Schema.Types.ObjectId
    ) {
        this.type = type || "Text";
        this.status = status || "Sent";
        this.payload = payload;
        this.media = media;
        this.sentBy = sentBy;
        this.sentByName = sentByName;
        this.repliedTo = repliedTo || null;
        this.sentAt = sentAt || new Date(new Date().toString().slice(0, new Date().toString().length - 42));
        this.modified = modified || false;
        this.translatedFrom = translatedFrom || null;
    }
}