export type Chat = {
    id: string,
    users: string[],
    history: Message[],
    chatName: string,
    details: string,
    private: boolean,
    createdAt: Date
}

export type Message = {
    id: number
    payload: string
    sentBy: string
    sentAt: Date
    repliedTo?: string
}