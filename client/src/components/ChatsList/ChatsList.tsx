import React, { useEffect, useState } from 'react';
import SearchChat from './SearchChat/SearchChat';
import ChatItem from './ChatItem/ChatItem';
import { Chat } from '../../types/types';
import { observer } from 'mobx-react-lite';
import { store } from '../../store/ChatStore';
import { getUserChats } from '../../http/chatAPI';

const ChatsList: React.FC = observer(() => {
    const [chatList, setChatList] = useState<[]>([]);
    const [focusOnSearch, setFocusOnSearch] = useState<boolean>(false);

    useEffect(() => {
        getUserChats().then((data: Chat[]) => store.userChats = data);
    }, []);

    return (
        <div>
            <SearchChat onFind={setChatList} onFocus={setFocusOnSearch} focus={focusOnSearch} />
            {focusOnSearch ?
                (chatList.map((chatItem: Chat) => {
                    return <ChatItem key={chatItem._id} chat={chatItem} />
                })) : (
                    store?.userChats?.map(chatItem => {
                        return <ChatItem key={chatItem._id} chat={chatItem} />
                    })
                )
            }
        </div>
    )
});

export default ChatsList;