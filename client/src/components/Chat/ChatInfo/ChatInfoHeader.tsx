import { observer } from "mobx-react-lite";
import React, { useEffect, useState } from "react";
import { store } from "../../../store/ChatStore";
import './ChatInfoHeader.css';
import { ArrowLeftOutlined } from "@ant-design/icons";
import { uiStore } from "../../../store/UIStore";
import { getOneUser } from "../../../http/userAPI";
import ChatInfoModal from "./ChatInfoModal/ChatInfoModal";

const ChatInfoHeader: React.FC = observer(() => {
    const [chatName, setChatName] = useState<string>("");

    const onCancelChat = () => {
        store.chat = undefined;
    }

    const getUserName = async () => {
        let userId = store.chat?.users.find(id => id !== store.user?._id);
        getOneUser(userId as string).then(data => setChatName(data as string));
    }

    useEffect(() => {
        if (store.chat?.private && !store.chat.chatName) getUserName();
        else setChatName(store.chat?.chatName as string);
    }, [store.chat]);

    return (
        <div className="chat-info-header__container">
            <ArrowLeftOutlined onClick={() => onCancelChat()}/>
            <span onClick={() => uiStore.showChatInfo = true}>{chatName}</span>
            <ChatInfoModal chatName={chatName} />
        </div>
    )
});

export default ChatInfoHeader;