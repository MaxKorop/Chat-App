import React, { useEffect, useRef, useState } from "react";
import ChatContent from "./ChatContent/ChatContent";
import InputMessage from "./Input/Input";
import { observer } from "mobx-react-lite";
import { store } from "../../store/ChatStore";
import JoinChatButton from "./JoinChatButton/JoinChatButton";
import ChatInfoHeader from "./ChatInfo/ChatInfoHeader";

const Chat: React.FC = observer(() => {
    const [scrollHeight, setScrollHeight] = useState<number>(0);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<HTMLDivElement>(null);
    
    const chatResizeObserver = new ResizeObserver(() => {
        if (!(store.countUnreadMessages().find(unread => unread.chatId === store.chat?._id)?.unreadNumber)) chatContainerRef.current?.scrollTo({ top: chatContainerRef.current?.scrollHeight });
    });
    
    useEffect(() => {
        if (chatRef.current) chatResizeObserver.observe(chatRef.current);
        return () => chatResizeObserver.disconnect();
    }, []);

    useEffect(() => {
        if (scrollHeight) chatContainerRef.current?.scrollTo({ top: scrollHeight });
    }, [scrollHeight])

    return (
        <div className="chatting__container">
            <div className="chat_info__header">
                {store.chat ? <ChatInfoHeader /> : <></>}
            </div>
            <div ref={chatContainerRef} onScroll={() => scrollHeight ? setScrollHeight(0) : null} className="chat__container">
                <ChatContent setHeightToScroll={setScrollHeight} ref={chatRef} />
            </div>
            <div className="input_message__container">
                {store.chat ? ( store.isUserChat() ? <InputMessage />: <JoinChatButton />) : <></>}
            </div>
        </div>
    )
});

export default Chat;