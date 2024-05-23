import { Button, List } from "antd";
import { observer } from "mobx-react-lite";
import React from "react";
import { store } from "../../../../../store/ChatStore";
import { EditOutlined, ImportOutlined, DeleteOutlined } from "@ant-design/icons";
import { uiStore } from "../../../../../store/UIStore";

const MessageOperations: React.FC<{ messageId: string, messageSender: string, setIsEdit: Function }> = observer(({ messageId, messageSender, setIsEdit }) => {
    const operations = messageSender === store.user?._id ? [
        {
            title: (<><ImportOutlined /> Reply</>),
            danger: false,
            action: () => uiStore.replyToMessage = messageId
        },
        {
            title: (<><EditOutlined /> Edit</>),
            danger: false,
            action: () => setIsEdit(true)
        },
        {
            title: (<><DeleteOutlined /> Delete</>),
            danger: true,
            action: () => store.deleteMessage(messageId)
        }
    ] : (store.chat?.users && store.user?._id) && (store.chat?.users.findIndex(userId => userId === store.user?._id) === 0 || store.chat?.private) ? [
        {
            title: (<><ImportOutlined /> Reply</>),
            danger: false,
            action: () => uiStore.replyToMessage = messageId
        },
        {
            title: (<><DeleteOutlined /> Delete</>),
            danger: true,
            action: () => store.deleteMessage(messageId)
        }
    ] : [
            {
                title: (<><ImportOutlined /> Reply</>),
                danger: false,
                action: () => uiStore.replyToMessage = messageId
            }
    ];

    return (
        <List
            bordered
            dataSource={operations}
            renderItem={(item) => (
                <List.Item style={{ cursor: 'pointer' }} onClick={() => item.action()}>
                    <Button type="text" danger={item.danger}>{item.title}</Button>
                </List.Item>
            )}
        />
    )
});

export default MessageOperations;