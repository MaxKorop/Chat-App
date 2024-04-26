import { Input, InputRef } from 'antd';
import React, { ChangeEvent, useRef, useState } from 'react';
import { searchChats } from '../../../http/chatAPI';
import { LeftOutlined, SearchOutlined } from '@ant-design/icons';
import './SearchChat.css';

const SearchChat: React.FC<{ onFind: Function, onFocus: Function, focus: boolean }> = ({ onFind, onFocus, focus }) => {
    const chatNameRef = useRef<InputRef>(null);
    
    const [chatName, setChatName] = useState<string>("");

    // Searching chats with 
    const search = async () => {
        let chats;
        if (chatNameRef.current) {
            chats = await searchChats(chatNameRef.current?.input?.value as string);
        }
        if (chats) onFind(chats);
    }

    const backToMyChats = () => {
        onFocus(false);
        setChatName('');
    }

    return (
        <div className='search-chat__container'>
            { focus && <LeftOutlined style={{color: 'white'}} alt='Back to my chats' onClick={() => backToMyChats()} /> }
            <Input
                placeholder='Input chatname here...'
                onChange={() => search()}
                count={{ max: 25 }}
                onFocus={() => onFocus(true)}
                addonAfter={<SearchOutlined />}
                ref={chatNameRef}
            />
        </div>
    )
};

export default SearchChat;