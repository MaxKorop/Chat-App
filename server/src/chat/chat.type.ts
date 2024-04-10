import { ObjectId } from "mongoose"
import { Message } from "./message.type"

export type Chat = {
    chatName: string | null // Group | PrivateChata
    details: string // About chat
    users: ObjectId[] // Users
    private: Boolean // If group 'true' or 'false', if PrivateChat always false
    history: Message[] // Messages
    createdAt: Date // MongoDB Date
}