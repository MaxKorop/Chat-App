export interface MessageProps {
    payload: string
    sentBy: string
    sentAt: Date
    repliedTo?: string
}