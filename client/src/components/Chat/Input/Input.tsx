import React, { ChangeEvent, useCallback, useEffect, useState } from "react";
import { Button, Input, List, Popover, Upload } from "antd";
import { DeleteOutlined, SendOutlined, UploadOutlined } from "@ant-design/icons";
import { observer } from "mobx-react-lite";
import { store } from "../../../store/ChatStore";
import './Input.css';
import { uiStore } from "../../../store/UIStore";
import MessageReplyInput from "./MessageReplyInput/MessageReplyInput";
import { RcFile } from "antd/es/upload";
import { Image, toBase64 } from "../../../types/types";
import { uploadImages } from "../../../http/chatAPI";

const { TextArea } = Input;

const InputMessage: React.FC = observer(() => {
	const [message, setMessage] = useState<string>("");
	const [imagesToDisplay, setImagesToDisplay] = useState<(Image & { file: RcFile })[]>([]);
	const [displayUploadFiles, setDisplayUploadFiles] = useState<boolean>(false);
	
	const sendMessage = useCallback(async () => {
		if (message.trim().length) {
			const formData = new FormData();
			let imagesId: string[] = [];
			if (imagesToDisplay.length) {
				imagesToDisplay.map(image => formData.append('images', image.file));
				imagesId = await uploadImages(formData);
			}
			if (uiStore.replyToMessage) {
				store.sendMessage(message.trim(), uiStore.replyToMessage, imagesId);
				uiStore.replyToMessage = '';
				setMessage("");
				setImagesToDisplay([]);
			} else {
				store.sendMessage(message.trim(), null, imagesId);
				setMessage("");
				setImagesToDisplay([]);
			}
		} else {
			const formData = new FormData();
			let imagesId: string[] = [];
			if (imagesToDisplay.length) {
				imagesToDisplay.map(image => formData.append('images', image.file));
				imagesId = await uploadImages(formData);
			}
			if (uiStore.replyToMessage) {
				store.sendMessage("", uiStore.replyToMessage, imagesId);
				uiStore.replyToMessage = '';
				setMessage("");
				setImagesToDisplay([]);
			} else {
				store.sendMessage("", null, imagesId);
				setMessage("");
				setImagesToDisplay([]);
			}
		}
	}, [message, setMessage]);
	
	const addImage = async (file: RcFile) => {
		const image: (Image & { file: RcFile }) = {
			image: {
				mimetype: file.type,
				size: file.size,
				buffer: (await file.arrayBuffer())
			},
			file
		}
		if (!imagesToDisplay.find(prevImage => JSON.stringify(prevImage) === JSON.stringify(image))) setImagesToDisplay(prev => [...prev, image]);
		return false;
	}

	const deleteFromImages = (image: Image) => {
		setImagesToDisplay(prev => prev.filter(prevImage => JSON.stringify(prevImage) !== JSON.stringify(image)));
	}

	const uploadedFiles = () => {
		return (
			<List
				bordered
				itemLayout="horizontal"
				dataSource={imagesToDisplay}
				renderItem={(item) => 
					<List.Item style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', width: 150 }}>
						<img src={`data:${item.image.mimetype};base64, ${toBase64(item.image.buffer)}`} alt="upload image" style={{ width: 70, height: 'auto', objectFit: 'cover' }} />
						<DeleteOutlined onClick={() => deleteFromImages(item)} />
					</List.Item>
				}
			/>
		)
	}

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
		<div style={{width: '100%', display: 'flex', flexDirection: 'column'}}>
			{uiStore.replyToMessage ? <MessageReplyInput /> : <></>}
			<div className="input_message__wrapper">
				<Upload
					showUploadList={false}
					beforeUpload={(file: RcFile) => addImage(file)}
					multiple
				>
					{displayUploadFiles ? (
						<Popover content={uploadedFiles()}>
							<Button
								style={{ height: '100%', minHeight: '3rem' }}
								icon={<UploadOutlined />}
								onMouseEnter={() => setDisplayUploadFiles(true)}
							/>
						</Popover>
					) : (
						<Button
							style={{ height: '100%', minHeight: '3rem' }}
							icon={<UploadOutlined />}
							onMouseEnter={() => setDisplayUploadFiles(true)}
						/>
					)}
				</Upload>
				<TextArea
					placeholder="Type your message here..."
					className="input_message__text_area"
					value={message}
					onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
					style={{
						minHeight: '3rem',
						maxHeight: '10rem',
						maxWidth: '90%'
					}}
					autoSize={true}
				/>
				<Button className="input_message__send_button" onClick={() => sendMessage()} icon={<SendOutlined />} style={{ height: '100%', minHeight: '3rem' }} />
			</div>
		</div>
	)
});

export default InputMessage;