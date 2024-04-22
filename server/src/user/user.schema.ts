import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { Chat } from "src/chat/chat.schema";
import * as mongoose from "mongoose";

export type UserDocument = HydratedDocument<User>;

@Schema()
export class User {
    @Prop({ required: true })
    userName: string;

    @Prop({ required: true })
    password: string;

    @Prop({ default: "" })
    aboutMe: string;

    @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }] })
    chats: Chat;

    @Prop({ default: new Date() })
    lastTimeOnline: Date;

    @Prop({ default: true })
    online: boolean;

    @Prop({ default: false })
    hideLastTimeOnline: Boolean;

    @Prop({ default: false })
    hideInSearch: Boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);