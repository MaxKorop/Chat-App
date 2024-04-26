import { observer } from 'mobx-react-lite';
import React from 'react';
import { store } from '../../../store/ChatStore';
import { Chat } from '../../../types/types';
import './ChatItem.css';
import { LockOutlined, UnlockOutlined } from '@ant-design/icons';

const ChatItem: React.FC<{ chat: Chat }> = observer(({ chat }) => {

    // Selecting chat with 'click' from the list
    const handleClick = () => {
        store.joinChat(chat._id)
    }

    const publicIconStyles = {
        fontSize: '20px',
        marginRight: '10px',
        opacity: 0.5
    }

    return (
        <div className='chat-item__container' onClick={() => handleClick()}>
            <div className="chat-item__container-left">
                <div className="chat-item__public">
                    {chat.public ? <UnlockOutlined style={publicIconStyles} /> : <LockOutlined style={publicIconStyles} />}
                </div>
                <div className="chat-item_name">
                    {chat.chatName}
                </div>
            </div>
            <div className="chat-item__container-right">
                <div className="chat-item__private">
                    {chat.private ? <span>Private</span> : <span>Group</span>}
                </div>
            </div>
        </div>
    )
});

export default ChatItem;