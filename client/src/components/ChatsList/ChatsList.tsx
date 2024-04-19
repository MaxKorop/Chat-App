import React, { useState } from 'react';
import SearchChat from './SearchChat/SearchChat';
import ChatItem from './ChatItem/ChatItem';
import { Chat } from '../../types/types';

const ChatsList: React.FC = () => {
    const [chatList, setChatList] = useState<[]>([]);

    return (
        <div>
            <SearchChat onFind={setChatList} />
            {chatList.map((chatItem: Chat) => <ChatItem key={chatItem.id} chat={chatItem} />)}
        </div>
    )
};

export default ChatsList;