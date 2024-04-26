import { Date, ObjectId } from "mongoose"

export type User = {
    _id: ObjectId
    username: string
    email: string
    password: string
    aboutMe: string | null
    chats: ObjectId[]
    lastTimeOnline: Date
    hideLastTimeOnline: Boolean
    hideInSearch: Boolean
}