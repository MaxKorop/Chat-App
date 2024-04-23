import React from "react";
import { observer } from "mobx-react-lite";
import { store } from "../../store/ChatStore";
import { Message as MessageType } from "../../types/types";
import Message from "./Message/Message";
import './Chat.css';

const Chat = observer(React.forwardRef<HTMLDivElement>((props, ref) => {
    return (
        <div ref={ref} className="chat">
            {store.chat?.history.map((message: MessageType) => {
                return <Message message={message} />
            })}
        </div>
    )
}));

export default Chat;