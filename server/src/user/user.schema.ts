import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import * as mongoose from "mongoose";

export type UserDocument = HydratedDocument<User>;

@Schema()
export class User {
    @Prop({ required: true, minlength: 2, maxlength: 25 })
    userName: string;

    @Prop({ required: true })
    email: string;

    @Prop({ required: true })
    password: string;

    @Prop({ default: "", maxlength: 50 })
    aboutMe: string;

    @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] })
    friends: mongoose.Types.ObjectId[];

    @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }] })
    chats: mongoose.Types.ObjectId[];

    @Prop({ default: new Date() })
    lastTimeOnline: Date;

    @Prop({ default: false })
    online: boolean;

    @Prop({ default: false })
    hideLastTimeOnline: boolean;

    @Prop({ default: false })
    hideInSearch: boolean;

    @Prop({ default: true })
    canAddToFriends: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);