import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
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
    users: mongoose.Schema.Types.ObjectId[];

    // Chat with 1 user or with many users
    @Prop()
    private: Boolean;

    // Print in the search or not
    @Prop()
    public: Boolean;

    @Prop({ type: [{ type: mongoose.Schema.Types.Mixed }] })
    history: Message[];

    @Prop({ required: true })
    createdAt: Date;
}

export const ChatSchema = SchemaFactory.createForClass(Chat);