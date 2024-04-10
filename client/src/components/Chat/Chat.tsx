import React from "react";
import { observer } from "mobx-react-lite";
import { store } from "../../store/ChatStore";
import { Message as MessageType } from "../../types/types";
import Message from "./Message/Message";
import './Chat.css';

const Chat = observer(React.forwardRef<HTMLDivElement>((props, ref) => {
    store.joinChat("1");

    return (
        <div ref={ref} className="chat">
            {store.chat?.history.map((message: MessageType) => {
                return <Message sentBy={message.sentBy} sentAt={message.sentAt} payload={message.payload} repliedTo={message.repliedTo} key={message.id} />
            })}
        </div>
    )
}));

export default Chat;