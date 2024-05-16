import React, { useEffect, useState } from 'react';
import SearchChat from './SearchChat/SearchChat';
import { Chat } from '../../types/types';
import { observer } from 'mobx-react-lite';
import { store } from '../../store/ChatStore';
import { getUserChats } from '../../http/chatAPI';
import ChatList from './ChatList/ChatList';
import './SidePanel.css';
import UserModal from './ChatItem/UserModal/UserModal';
import { Button } from 'antd';
import CreateChatModal from './CreateChat/CreateChat';
import UserSettings from './User/UserSettings';
import { uiStore } from '../../store/UIStore';

const SidePanel: React.FC = observer(() => {
    const [chatList, setChatList] = useState<[]>([]);
    const [focusOnSearch, setFocusOnSearch] = useState<boolean>(false);

    useEffect(() => {
        getUserChats().then((data: Chat[]) => {
            store.userChats = data
            store.numberOfUnreadMessages = store.countUnreadMessages();
        });
    }, []);

    return (
        <div className='side_panel__container'>
            <div className='side_panel__wrapper-search_and_create'>
                <SearchChat onFind={setChatList} onFocus={setFocusOnSearch} focus={focusOnSearch} />
                {!focusOnSearch ? <Button style={{ margin: '5px 5px 5px 0' }} type='primary' onClick={() => uiStore.showCreateChat = true}>Create Chat</Button> : <></>}
            </div>
            <div className='side_panel__chats_list_container'>
                <ChatList focusOnSearch={focusOnSearch} chatList={chatList} />
            </div>
            <UserSettings />
            <UserModal onCancel={() => store.userInfo = null} />
            <CreateChatModal />
        </div>
    )
});

export default SidePanel;