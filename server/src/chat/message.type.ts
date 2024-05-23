import { Schema } from "mongoose"

export type Message = {
    _id: string
    status: "Sent" | "Read" // Status of message
    payload: string // Message information
    media?: Schema.Types.ObjectId[] // Id of Image document
    sentBy: Schema.Types.ObjectId // User
    sentByName: string
    readBy: Schema.Types.ObjectId[]
    repliedTo?: Schema.Types.ObjectId // Message
    sentAt: Date // MongoDb Date
    modified: Boolean
    translatedFrom?: Schema.Types.ObjectId // User
}