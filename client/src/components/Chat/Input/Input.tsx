import React, { ChangeEvent, useCallback, useEffect, useState } from "react";
import { Button, Input } from "antd";
import { SendOutlined } from "@ant-design/icons";
import { observer } from "mobx-react-lite";
import { store } from "../../../store/ChatStore";
import './Input.css';

const { TextArea } = Input;

const InputMessage: React.FC = observer(() => {
	const [message, setMessage] = useState<string>("");
	
	const sendMessage = useCallback(() => {
		store.sendMessage(message);
		setMessage("");
	}, [message, setMessage]);
	
	const callback = useCallback((event: KeyboardEvent) => {
		if ((event.metaKey || event.ctrlKey) && event.code === 'Enter') {
			sendMessage();
		}
	}, [sendMessage]);
	
	useEffect(() => {
		document.addEventListener('keydown', callback);
		return () => {
			document.removeEventListener('keydown', callback);
		};
	}, [callback]);
	
	return (
		<div className="input-message__wrapper">
			<TextArea
				placeholder="Type your message here..."
				className="input-message__text-area"
				value={message}
				onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
				style={{
					minHeight: '3rem',
					maxHeight: '10rem',
					maxWidth: '90%'
				}}
				autoSize={true}
			/>
			<Button className="input-message__send-button" onClick={() => sendMessage()} icon={<SendOutlined />} style={{ height: '100%', minHeight: '3rem' }} />
		</div>
	)
});

export default InputMessage;