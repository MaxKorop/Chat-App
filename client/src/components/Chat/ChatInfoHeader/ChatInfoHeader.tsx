import { observer } from "mobx-react-lite";
import React from "react";
import { store } from "../../../store/ChatStore";
import './ChatInfoHeader.css';

const ChatInfoHeader: React.FC = observer(() => {
    return (
        <div className="chat-info-header__container">
            <span>{store.chat?.chatName}</span>
        </div>
    )
});

export default ChatInfoHeader;