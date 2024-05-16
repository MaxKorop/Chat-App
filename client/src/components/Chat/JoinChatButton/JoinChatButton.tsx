import { Button, message } from "antd";
import { observer } from "mobx-react-lite";
import React from "react";
import { store } from "../../../store/ChatStore";
import { joinChat } from "../../../http/chatAPI";
import { joinUserToChat } from "../../../http/userAPI";
import { MessageError, errorMessage } from "../../../types/types";

const JoinChatButton: React.FC = observer(() => {
    const [messageApi, contextHolder] = message.useMessage();

    const join = async () => {
        try {
            const chat = await joinChat(store.chat?._id as string);
            if (chat) {
                const user = await joinUserToChat(chat._id as string);
                store.user = user;
            }
        } catch (error) {
            if (error instanceof MessageError) {
                errorMessage(error.message, messageApi);
            }
        }
    }

    return (
        <>
            {contextHolder}
            <div>
                <Button size="large" style={{ width: '99.9%' }} onClick={() => join()}>JoinChat</Button>
            </div>
        </>
    )
});

export default JoinChatButton;