import { Date, ObjectId } from "mongoose"

export type User = {
    username: string
    email: string
    password: string
    aboutMe: string | null
    chats: ObjectId[]
    lastTimeOnline: Date
    hideLastTimeOnline: Boolean
    hideInSearch: Boolean
}