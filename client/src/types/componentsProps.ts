import { Message } from "./types"

export interface MessageProps {
    message: Message
}

export interface LogInComponentProps {
    userName: string,
    setUserName: (arg0: string) => void,
    password: string,
    setPassword: (arg0: string) => void,
    setIsLogin: (arg0: boolean) => void
}

export interface SignUpComponentProps extends LogInComponentProps {
    email: string,
    setEmail: (arg0: string) => void
}