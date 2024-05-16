import { Schema } from "mongoose"
import { ImageType } from "src/image/image.type"

export type Message = {
    _id: string
    type: "Text" | "Image" | "GIF" | "Video" // Type for message
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