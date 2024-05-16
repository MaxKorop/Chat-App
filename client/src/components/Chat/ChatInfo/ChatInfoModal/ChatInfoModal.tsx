import { observer } from "mobx-react-lite";
import React, { useEffect, useState } from "react";
import { uiStore } from "../../../../store/UIStore";
import { Avatar, List, Modal, Space } from "antd";
import { store } from "../../../../store/ChatStore";
import { getOneUser } from "../../../../http/userAPI";
import { normalizeTimeUk } from "../../../../types/types";
import { EditOutlined } from "@ant-design/icons";

const ChatInfoModal: React.FC<{ chatName: string }> = observer(({ chatName }) => {
    const [userList, setUserList] = useState<string[]>([]);

    const getUsersNames = () => {
        store.chat?.users.map(async (userId) => {
            const userName = await getOneUser(userId) as string;
            setUserList(prev => [...prev, userName]);
        })
    }

    useEffect(() => {
        getUsersNames();
    }, [store.chat]);

    return (
        <Modal
            destroyOnClose
            title={(<><span style={{ marginRight: 20 }}>{chatName}</span>{store.chat?.users[0] === store.user?._id ? <EditOutlined /> : <></>}</>)}
            open={uiStore.showChatInfo}
            onCancel={() => { uiStore.showChatInfo = false; setUserList([]); }}
            footer={(<></>)}
        >
            <Space
                style={{width: '100%'}}
                direction="vertical"
                size={'large'}
            >
                <div>
                    <span>Chat created at:</span>
                    <span>{normalizeTimeUk(store.chat?.createdAt)}</span>
                </div>
                {store.chat?.details.length ? <div style={{ width: '100%' }}>
                    <span>Chat description:</span>
                    <span>{store.chat?.details}</span>
                </div> : <></>}
                <div>
                    <span>Users:</span>
                        <List
                            bordered
                            dataSource={userList}
                            itemLayout="horizontal"
                            renderItem={(item) => (
                                <List.Item>
                                    <List.Item.Meta
                                        avatar={<Avatar>{item[0].toUpperCase()}</Avatar>}
                                        title={item}
                                    />
                                </List.Item>
                            )}
                        />
                </div>
            </Space>
        </Modal>
    )
});

export default ChatInfoModal;