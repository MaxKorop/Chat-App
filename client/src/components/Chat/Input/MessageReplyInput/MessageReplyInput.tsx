import { observer } from "mobx-react-lite";
import React from "react";
import { store } from "../../../../store/ChatStore";
import { CloseOutlined, ImportOutlined } from "@ant-design/icons";
import { uiStore } from "../../../../store/UIStore";
import './MessageReplyInput.css';

const MessageReplyInput: React.FC = observer(() => {
	const messagePayload = store.chat?.history.find(message => message._id === uiStore.replyToMessage)?.payload as string;
	const payloadToDisplay = messagePayload?.length <= 20 ? messagePayload : messagePayload + '...';

	return (
		<div className="message_reply-input">
			<div style={{ margin: 5, marginLeft: 20 }}>
				<ImportOutlined style={{opacity: 0.5}} />
				<span style={{ marginLeft: 10 }}>{payloadToDisplay}</span>
			</div>
			<CloseOutlined
				style={{ margin: 5, marginRight: 10 }}
				onClick={() => uiStore.replyToMessage = ''}
			/>
		</div>
	)
});

export default MessageReplyInput;