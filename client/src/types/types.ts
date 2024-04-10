export type Chat = {
    id: string,
    members: string[],
    history: Message[]
}

export type Message = {
    id: number
    payload: string
    sentBy: string
    sentAt: Date
    repliedTo?: string
}