import React, { useEffect, useRef } from "react";
import ChatContent from "./ChatContent/ChatContent";
import InputMessage from "./Input/Input";
import { observer } from "mobx-react-lite";
import { store } from "../../store/ChatStore";
import JoinChatButton from "./JoinChatButton/JoinChatButton";
import ChatInfoHeader from "./ChatInfoHeader/ChatInfoHeader";

const Chat: React.FC = observer(() => {
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<HTMLDivElement>(null);
    
    const chatResizeObserver = new ResizeObserver(() => {
        chatContainerRef.current?.scrollTo({ top: chatContainerRef.current?.scrollHeight });
    });
    
    useEffect(() => {
        if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        if (chatRef.current) chatResizeObserver.observe(chatRef.current);
        return () => chatResizeObserver.disconnect();
    }, []);

    return (
        <div className="chatting__container">
            <div className="chat-info-header">
                {store.chat ? <ChatInfoHeader /> : <></>}
            </div>
            <div ref={chatContainerRef} className="chat__container">
                <ChatContent ref={chatRef} />
            </div>
            <div className="input_message__container">
                {store.chat ? ( store.isUserChat() ? <InputMessage />: <JoinChatButton />) : <></>}
            </div>
        </div>
    )
});

export default Chat;