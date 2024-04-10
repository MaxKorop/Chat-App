import { Schema } from "mongoose"

export type Message = {
    type: "Text" | "Image" | "GIF" | "Video" // Type for message
    status: "Sent" | "Read" // Status of message
    payload: string // Message information
    media?: Buffer // If message.type == Image | GIF | Video
    sentBy: Schema.Types.ObjectId // User
    repliedTo?: Schema.Types.ObjectId // Message
    sentAt: Date // MongoDb Date
    modified: Boolean
    translatedFrom?: Schema.Types.ObjectId // User
}