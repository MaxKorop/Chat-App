import { QuestionCircleOutlined } from "@ant-design/icons";
import { Avatar, Button, Form, Input, Modal, Select, SelectProps, Space, Switch, Tooltip, message } from "antd";
import React, { ChangeEvent, useEffect, useState } from "react";
import './CreateChat.css';
import { Chat, User } from "../../../types/types";
import { check, getFriends } from "../../../http/userAPI";
import { createChat, getUserChats } from "../../../http/chatAPI";
import { store } from "../../../store/ChatStore";

const CreateChatModal: React.FC<{ show: boolean, onOk: Function }> = ({ show, onOk }) => {
    const [chatName, setChatName] = useState<string>("");
    const [chatDescription, setChatDescription] = useState<string>("");
    const [privateChat, setPrivateChat] = useState<boolean>(false);
    const [publicChat, setPublicChat] = useState<boolean>(false);
    const [friends, setFriends] = useState<string[]>([]);
    const [userFriends, setUserFriends] = useState<User[]>([]);
    const [messageApi, contextHolder] = message.useMessage();

    const changePrivateChat = () => {
        if (privateChat) {
            setPrivateChat(false);
        }
        if (!privateChat) {
            setPrivateChat(true);
            setChatName("");
            setChatDescription("");
        }
    }

    const changePublicChat = () => {
        setPublicChat(prev => !prev);
    }

    const getUserFriends = async () => {
        setUserFriends(await getFriends());
    }

    const generateOptions = (): SelectProps['options'] => {
        return userFriends.map(friend => {
            return {
                label: friend.userName,
                value: friend._id,
                emoji: <Avatar>{friend.userName[0].toUpperCase()}</Avatar>
            }
        });
    }

    const error = (payload: string) => {
        messageApi.open({
            type: "error",
            content: payload
        })
    }

    const createAndSaveChat = async () => {
        if (!friends.length && !publicChat) {
            error("Chat must have at least one friend when not public!");
            return;
        } else if (!chatName.length && !privateChat) {
            error("Chat must have name!");
            return;
        } else if (store.user) {
            const chat = {
                'chatName': chatName,
                'details': chatDescription,
                'private': privateChat,
                'public': publicChat,
                'users': [store.user._id, ...friends]
            }
            const createdChat = await createChat(chat);
            const user = await check();
            const data: Chat[] = await getUserChats();
            store.user = user;
            store.userChats = data;
            store.joinChat(createdChat._id);
            onOk();
        }
    }

    useEffect(() => {
        getUserFriends();
    }, []);

    return (
        <>
            {contextHolder}
            <Modal
                title="Create new chat"
                open={show}
                footer={
                    <Button
                        type="primary"
                        onClick={() => createAndSaveChat()}
                    >
                        Create chat
                    </Button>
                }
                onCancel={() => onOk()}
            >
                <Form>
                    <Space size={'large'} direction="vertical" style={{ width: '100%' }}>
                        {!privateChat && (<>
                            <div style={{ marginTop: 5 }} className="create_chat__chat_name">
                                <div style={{ width: '100%' }} >
                                    <span>Chat name:</span>
                                    <Input
                                        placeholder="Input chat name here..."
                                        value={chatName}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setChatName(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="create_chat__chat_description">
                                <div style={{ width: '100%' }} >
                                    <span>Chat description:</span>
                                    <Input
                                        placeholder="Input chat description here..."
                                        value={chatDescription}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setChatDescription(e.target.value)}
                                    />
                                </div>
                            </div>
                        </>)}
                        <div className="create_chat__chat_private">
                            <div>
                                <Tooltip title="This switch means that your chat will be private (between two people) or not (between many people)">
                                    <QuestionCircleOutlined />
                                </Tooltip>
                                <span style={{marginLeft: 5}}>Chat private:</span>
                            </div>
                            <Switch value={privateChat} onChange={() => changePrivateChat()} />
                        </div>
                        <div className="create_chat__chat_public">
                            <div>
                                <Tooltip title="This switch means that your chat will be public (show in search) or not (do not show in search, only add users manually or by link)">
                                    <QuestionCircleOutlined />
                                </Tooltip>
                                <span style={{marginLeft: 5}}>Chat public:</span>
                            </div>
                            <Switch value={publicChat} onChange={() => changePublicChat()} />
                        </div>
                        <div className="create_chat__chat_users">
                            <span>Users</span>
                            <Select
                                mode={privateChat ? undefined : "multiple"}
                                allowClear
                                placeholder="Select friends that will be added to this chat"
                                onChange={(e) => setFriends(e)}
                                options={generateOptions()}
                                optionRender={(option) => (
                                    <div>
                                        <Avatar>{option.data.emoji}</Avatar>
                                        <span style={{ marginLeft: 3 }}>{option.label}</span>
                                    </div>
                                )}
                                style={{ width: '50%' }}
                            />
                        </div>
                    </Space>
                </Form>
            </Modal>
        </>
    )
};

export default CreateChatModal;