export type User = {
    _id: string
    userName: string
    aboutMe: string[]
    chats: string[]
    friends: string[]
    lastTimeOnline: Date
    online: boolean
    hideLastTimeOnline: boolean
    hideInSearch: boolean
}

export type Chat = {
    _id: string
    users: User[]
    history: Message[]
    userNames: string[]
    chatName: string
    details: string
    private: boolean
    public: boolean
    createdAt: Date
}

export const isUser = (value: User | Chat): value is User => 'userName' in value;

export type Message = {
    _id: number
    payload: string
    sentBy: string
    sentByName: string
    sentAt: Date
    repliedTo?: string
}