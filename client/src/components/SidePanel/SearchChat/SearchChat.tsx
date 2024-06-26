import { Form, Input, InputRef, Select, message } from 'antd';
import React, { memo, useRef, useState } from 'react';
import { searchChats } from '../../../http/chatAPI';
import { LeftOutlined, SearchOutlined, UserOutlined, WechatOutlined } from '@ant-design/icons';
import { searchUsers } from '../../../http/userAPI';
import './SearchChat.css';
import { MessageError, errorMessage } from '../../../types/types';

const { Option } = Select;

const SearchChat: React.FC<{ onFind: Function, onFocus: Function, focus: boolean }> = ({ onFind, onFocus, focus }) => {
    const chatNameRef = useRef<InputRef>(null);
    const [isUsers, setIsUsers] = useState<"chats" | "users">("chats");
    const [messageApi, contextHolder] = message.useMessage();

    const SelectBefore: React.FC<{ changeState: Function }> = memo(({ changeState }) => {
        return (
            <Select defaultValue={isUsers} onChange={(e: any) => changeState(e)}>
                <Option value="chats"><WechatOutlined /></Option>
                <Option value="users"><UserOutlined /></Option>
            </Select>
        )
    })
    

    // Searching chats with 
    const search = async () => {
        try {
            let chats;
            if (chatNameRef.current) {
                if (isUsers === 'chats') chats = await searchChats(chatNameRef.current?.input?.value as string);
                else if (isUsers === 'users') chats = await searchUsers(chatNameRef.current?.input?.value as string);
            }
            if (chats) onFind(chats);
        } catch (error) {
            if (error instanceof MessageError) {
                errorMessage(error.message, messageApi);
            }
        }
    }

    const backToMyChats = () => {
        onFocus(false);
    }

    return (
        <>
            {contextHolder}
            <Form className='search-chat__container' autoComplete='off'>
                { focus && <LeftOutlined style={{color: 'white'}} alt='Back to my chats' onClick={() => backToMyChats()} /> }
                <Input
                    type='text'
                    placeholder='Input chatname here...'
                    onChange={() => search()}
                    count={{ max: 25 }}
                    onFocus={() => onFocus(true)}
                    addonBefore={focus ? <SelectBefore changeState={setIsUsers}/> : null}
                    addonAfter={<SearchOutlined />}
                    ref={chatNameRef}
                />
            </Form>
        </>
    )
};

export default SearchChat;