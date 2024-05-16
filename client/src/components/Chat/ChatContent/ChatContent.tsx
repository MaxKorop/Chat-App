import React from "react";
import { observer } from "mobx-react-lite";
import { store } from "../../../store/ChatStore";
import { Message as MessageType } from "../../../types/types";
import Message from "./Message/Message";
import { ChatContentProps } from "../../../types/componentsProps";
import { Divider } from "antd";
import './ChatContent.css';

const ChatContent = observer(React.forwardRef<HTMLDivElement, ChatContentProps>(({ setHeightToScroll }, ref) => {
    return (
        <div ref={ref} className="chat">
            {store.chat?.history.map((message: MessageType, index: number) => {
                if (store.chat) {
                    if (store.chat?.history.length > 1) {
                        if (!message.readBy.includes(store.user?._id as string) && store.chat?.history[index - 1].readBy.includes(store.user?._id as string)) {
                            return (
                                <>
                                    <Divider>New Messages ⬇️</Divider>
                                    <Message message={message} setHeightToScroll={setHeightToScroll} key={message._id} />
                                </>
                            )
                        } else {
                            return <Message message={message} setHeightToScroll={setHeightToScroll} key={message._id} />
                        }
                    } else {
                        return <Message message={message} setHeightToScroll={setHeightToScroll} key={message._id} />
                    }
                }
            })}
        </div>
    )
}));

export default ChatContent;