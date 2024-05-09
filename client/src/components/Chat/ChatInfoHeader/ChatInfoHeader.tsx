import { observer } from "mobx-react-lite";
import React from "react";
import { store } from "../../../store/ChatStore";
import './ChatInfoHeader.css';
import { ArrowLeftOutlined } from "@ant-design/icons";

const ChatInfoHeader: React.FC = observer(() => {
    const onCancelChat = () => {
        store.chat = undefined;
    }

    return (
        <div className="chat-info-header__container">
            <ArrowLeftOutlined onClick={() => onCancelChat()}/>
            <span>{store.chat?.chatName}</span>
        </div>
    )
});

export default ChatInfoHeader;