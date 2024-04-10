import { ObjectId } from "mongoose"

export class CreateUserDto {
    readonly name: string
    readonly email: string
    readonly password: string
    readonly aboutMe: string | null
    readonly chats: ObjectId[]
    readonly lastTimeOnline: Date
    readonly hideLastTimeOnline: Boolean
    readonly hideInSearch: Boolean
}