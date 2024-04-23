export type User = {
    _id: string
    userName: string
    aboutMe: string[]
    chats: string[]
    lastTimeOnline: Date
    online: boolean
    hideLastTimeOnline: boolean
    hideInSearch: boolean
}

export type Chat = {
    _id: string
    users: User[]
    history: Message[]
    chatName: string
    details: string
    private: boolean
    public: boolean
    createdAt: Date
}

export type Message = {
    _id: number
    payload: string
    sentBy: string
    sentAt: Date
    repliedTo?: string
}