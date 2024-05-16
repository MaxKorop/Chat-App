import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional } from "class-validator";
import { ObjectId } from "mongodb";
import { Schema } from "mongoose"
import { ImageType } from "src/image/image.type";
import { v4 } from 'uuid';

export class CreateMessageDto {
    _id: string;

    @IsOptional()
    @Transform(({ value }) => (value === undefined ? "Text" : value))
    type: "Text" | "Image" | "GIF" | "Video"; // Type for message
    
    @Transform(({ value }) => (value === undefined ? "Sent" : value))
    status: "Sent" | "Read"; 

    @IsNotEmpty()
    payload: string; // Message information

    @IsOptional()
    media: Schema.Types.ObjectId[]; // If message.type == Image | GIF | Video

    @IsNotEmpty()
    sentBy: Schema.Types.ObjectId; // User

    @IsNotEmpty()
    sentByName: string;

    readBy: Schema.Types.ObjectId[];

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
        readBy: Schema.Types.ObjectId[],
        repliedTo?: Schema.Types.ObjectId,
        media: Schema.Types.ObjectId[] = [],
        type?: "Text" | "Image" | "GIF" | "Video",
        status?: "Sent" | "Read",
        sentAt?: Date,
        modified?: Boolean,
        translatedFrom?: Schema.Types.ObjectId
    ) {
        this._id = v4();
        this.payload = payload;
        this.media = media;
        this.sentBy = sentBy;
        this.sentByName = sentByName;
        this.readBy = readBy;
        this.type = type ?? "Text";
        this.status = status ?? "Sent";
        this.repliedTo = repliedTo ?? null;
        this.sentAt = sentAt ?? new Date();
        this.modified = modified ?? false;
        this.translatedFrom = translatedFrom ?? null;
    }
}