import { Button, Input } from 'antd';
import React, { ChangeEvent, useState } from 'react';
import { searchChats } from '../../../http/http';

const SearchChat: React.FC<{ onFind: Function }> = ({ onFind }) => {
    const [chatName, setChatName] = useState<string>("");

    // Searching chats with 
    const search = async () => {
        const chats = await searchChats(chatName);
        if (chats) onFind(chats);
        setChatName("");
    }

    return (
        <div>
            <Input placeholder='Input chatname here...' value={chatName} onChange={(e: ChangeEvent<HTMLInputElement>) => setChatName(e.target.value)} count={{ max: 25 }}/>
            <Button onClick={() => search()}>Search</Button>
        </div>
    )
};

export default SearchChat;