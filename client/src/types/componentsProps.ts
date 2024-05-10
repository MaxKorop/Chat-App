import { InputRef } from "antd"
import { Message } from "./types"
import { RefObject } from "react"

export interface MessageProps {
    message: Message,
    setHeightToScroll: Function
}

export interface LogInComponentProps {
    userName: RefObject<InputRef>,
    password: RefObject<InputRef>,
    setIsLogin: (arg0: boolean) => void
}

export interface SignUpComponentProps extends LogInComponentProps {
    email: RefObject<InputRef>
}

export interface ChatContentProps {
    setHeightToScroll: Function
}