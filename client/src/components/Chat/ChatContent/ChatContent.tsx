import React from "react";
import { observer } from "mobx-react-lite";
import { store } from "../../../store/ChatStore";
import { Message as MessageType } from "../../../types/types";
import Message from "./Message/Message";
import './ChatContent.css';

const ChatContent = observer(React.forwardRef<HTMLDivElement>((props, ref) => {
    return (
        <div ref={ref} className="chat">
            {store.chat?.history.map((message: MessageType) => {
                return <Message message={message} key={message._id} />
            })}
        </div>
    )
}));

export default ChatContent;