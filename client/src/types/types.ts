import { MessageInstance } from "antd/es/message/interface"
import moment from "moment"

export type User = {
    _id: string
    userName: string
    email: string
    aboutMe: string
    chats: string[]
    friends: string[]
    lastTimeOnline: Date
    online: boolean
    hideLastTimeOnline: boolean
    hideInSearch: boolean
    canAddToFriends: boolean
}

export type UpdateUser = {
    userName: string
    aboutMe: string
    hideLastTimeOnline: boolean
    hideInSearch: boolean
    canAddToFriends: boolean
}

export type Chat = {
    _id: string
    users: string[]
    history: Message[]
    chatName: string
    details: string
    private: boolean
    public: boolean
    createdAt: Date
}

export const isUser = (value: User | Chat): value is User => 'userName' in value;

export type Message = {
    _id: string
    payload: string
    sentBy: string
    sentByName: string
    sentAt: Date
    repliedTo?: string
    type: "Text" | "Image" | "GIF" | "Video" // Type for message
    status: "Sent" | "Read" // Status of message
    media?: string[] // If message.type == Image | GIF | Video
    readBy: string
    modified: Boolean
    translatedFrom?: string
}

export type Image = {
    _id?: string
    image: {
        mimetype: string
        size: number
        buffer: ArrayBuffer
    }
}

export class MessageError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export const errorMessage = (payload: string, messageApi: MessageInstance) => {
    messageApi.open({
        type: "error",
        content: payload
    })
}

export const normalizeTimeUk = (dateTime: Date | undefined, format: string = 'DD-MM-YY HH:mm') => {
    if (dateTime) return moment(dateTime).format(format);
    else return undefined;
}

export const toBase64 = (buffer: ArrayBuffer) => {
	var binary = '';
	var bytes = new Uint8Array( buffer );
	var len = bytes.byteLength;
	for (var i = 0; i < len; i++) {
		binary += String.fromCharCode( bytes[ i ] );
	}
	return window.btoa( binary );
}