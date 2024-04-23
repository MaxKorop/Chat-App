import { observer } from 'mobx-react-lite';
import React from 'react';
import { store } from '../../../store/ChatStore';
import { Chat } from '../../../types/types';
import './ChatItem.css';

const ChatItem: React.FC<{ chat: Chat }> = observer(({ chat }) => {

    // Selecting chat with 'click' from the list
    const handleClick = () => {
        store.joinChat(chat._id)
    }

    return (
        <div className='chat_item' onClick={() => handleClick()}>
            {chat.chatName}
        </div>
    )
});

export default ChatItem;