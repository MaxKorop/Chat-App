import { Date, ObjectId } from "mongoose"

export type User = {
    _id: ObjectId
    username: string
    email: string
    password: string
    aboutMe: string | null
    friends: ObjectId[]
    chats: ObjectId[]
    online: boolean
    lastTimeOnline: Date
    hideLastTimeOnline: Boolean
    hideInSearch: Boolean
    canAddToFriends: boolean
}