import React, { useCallback, useEffect, useRef, useState } from "react";
import { ConfigProvider } from "antd";
import Chat from "./components/Chat/Chat";
import InputMessage from "./components/Chat/Input/Input";
import UsernameModal from "./components/Modal/Modal";
import { THEME } from "./theme";
import './App.css';
import { observer } from "mobx-react-lite";
import { store } from "./store/ChatStore";
import { io } from "socket.io-client";

const App: React.FC = observer(() => {
	const [showModal, setShowModal] = useState<boolean>(true);
	const chatContainerRef = useRef<HTMLDivElement>(null);
	const chatRef = useRef<HTMLDivElement>(null);

	const chatResizeObserver = new ResizeObserver(() => {
		chatContainerRef.current?.scrollTo({ top: chatContainerRef.current?.scrollHeight });
	});

	useEffect(() => {
		if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
		if (chatRef.current) chatResizeObserver.observe(chatRef.current);
		if (store.userName.length) {
			store.socket = io("ws://localhost:5000", { transports: ['websocket', 'polling'], query: { userId: store.userName } });
		}
		return () => chatResizeObserver.disconnect();
	}, [store.userName]);

	return (
		<div className="app">
			<ConfigProvider
				theme={THEME}
			>
				{!showModal && (
					<>
						<div ref={chatContainerRef} className="chat__container">
							<Chat ref={chatRef} />
						</div>
						<div className="input_message__container">
							<InputMessage />
						</div>
					</>
				)}
				<UsernameModal show={showModal} setShow={setShowModal} />
			</ConfigProvider>
		</div>
	)
});

export default App;