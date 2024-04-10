import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { User } from "../user/user.schema";
import * as mongoose from "mongoose";
import { Message } from "src/chat/message.type";

export type ChatDocument = HydratedDocument<Chat>;

@Schema()
export class Chat {
    @Prop()
    chatName: string | null;

    @Prop()
    details: string;

    @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], required: true })
    users: User;

    @Prop()
    private: Boolean;

    @Prop({ type: [{ type: mongoose.Schema.Types.Mixed }] })
    history: Message[];

    @Prop({ required: true })
    createdAt: mongoose.Schema.Types.Date;
}

export const ChatSchema = SchemaFactory.createForClass(Chat);