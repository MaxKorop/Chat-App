import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { Chat } from "src/chat/chat.schema";
import * as mongoose from "mongoose";

export type UserDocument = HydratedDocument<User>;

@Schema()
export class User {
    @Prop({ required: true })
    username: string;

    @Prop({ required: true })
    email: string;

    @Prop({ required: true })
    password: string;

    @Prop()
    aboutMe: string | null;

    @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }] })
    chats: Chat;

    @Prop()
    lastTimeOnline: mongoose.Schema.Types.Date;

    @Prop()
    hideLastTimeOnline: Boolean;

    @Prop()
    hideInSearch: Boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);