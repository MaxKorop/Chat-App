import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import { store } from '../../../store/ChatStore';
import { Chat, User, isUser } from '../../../types/types';
import { GlobalOutlined, LockOutlined, UserOutlined, WechatOutlined } from '@ant-design/icons';
import { Avatar, Badge } from 'antd';
import './ChatItem.css';
import { getOneUser } from '../../../http/userAPI';

const ChatItem: React.FC<{ chatOrUser: Chat | User }> = observer(({ chatOrUser }) => {
    const [chatName, setChatName] = useState<string>("");
    // Selecting chat with 'click' from the list
    const handleClick = () => {
        if (!isUser(chatOrUser)) store.joinChat(chatOrUser._id);
        if (isUser(chatOrUser)) store.userInfo = chatOrUser;
    }

    const getUserName = async () => {
        if (!isUser(chatOrUser)) {
            let userId = chatOrUser.users.find(id => id !== store.user?._id);
            getOneUser(userId as string).then(data => setChatName(data as string));
        }
    }

    const publicIconStyles = {
        fontSize: '20px',
        marginRight: '10px',
        opacity: 0.5
    }
    if (!isUser(chatOrUser)) {
        useEffect(() => {
            const handleUpdateUnread = (chat: Chat) => {
                store.countAndUpdateUnreadMessagesForChat(chat);
            }
    
            store.events.on("updateUnreadMessages", handleUpdateUnread);
    
            return () => {
                store.events.off("updateUnreadMessages", handleUpdateUnread);
            }
        }, [store.numberOfUnreadMessages]);

        useEffect(() => {
            if (chatOrUser.private && !chatOrUser.chatName) getUserName();
        }, []);
    }

    if (!isUser(chatOrUser)) {
        return (
            <div className='chat-item__container' onClick={() => handleClick()}>
                <div className="chat-item__container-left">
                    <div className="chat-item__public">
                        {chatOrUser.private ? <></> : chatOrUser.public ? <GlobalOutlined style={publicIconStyles} /> : <LockOutlined style={publicIconStyles} />}
                    </div>
                    <div className="chat-item_name">
                        {chatOrUser.private && !chatOrUser.chatName ? chatName : chatOrUser.chatName }
                    </div>
                </div>
                <div className="chat-item__container-right">
                    <Badge count={store.numberOfUnreadMessages.find(unread => unread.chatId === chatOrUser._id)?.unreadNumber ?? 0} />
                    <div className="chat-item__private">
                        {chatOrUser.private && !chatOrUser.chatName ? <span>Private <UserOutlined /></span> : <span>Group <WechatOutlined /></span>}
                    </div>
                </div>
            </div>
        )
    } else if (isUser(chatOrUser)) {
        return (
            <div className='chat-item__container' onClick={() => handleClick()}>
                <div className="chat-item__container-left">
                    <div className="chat-item__public">
                        <Avatar>{ chatOrUser.userName[0] }</Avatar>
                    </div>
                    <div className="chat-item_name" style={{marginLeft: 10}}>
                        {chatOrUser.userName}
                    </div>
                </div>
            </div>
        )
    } else {
        return <div></div>
    }
});

export default ChatItem;