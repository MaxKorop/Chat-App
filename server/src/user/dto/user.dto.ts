import { Exclude } from "class-transformer"
import { IsEmail, IsNotEmpty } from "class-validator"
import mongoose from "mongoose"
import { User } from "../user.schema"

export class LogInUserDto {
    @IsNotEmpty()
    userName: string

    @IsNotEmpty()
    password: string
}

export class CreateUserDto extends LogInUserDto {
    @IsEmail()
    email: string    
}

export class ResponseUserDto {
    _id: string

    userName: string

    @Exclude()
    password: string

    @Exclude()
    friends: mongoose.Schema.Types.ObjectId[]

    @Exclude()
    chats: mongoose.Schema.Types.ObjectId[]
    
    email: string
    
    aboutMe: string
    
    lastTimeOnline: Date
    
    online: boolean
    
    hideLastTimeOnline: boolean
    
    hideInSearch: boolean
    
    canAddToFriends: boolean

    constructor(partial: Partial<User & { _id: mongoose.Schema.Types.ObjectId[] }>) {
        Object.assign(this, partial);
        this._id = partial._id.toString();
    }
}