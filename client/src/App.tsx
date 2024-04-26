import React, { useCallback, useEffect, useRef, useState } from "react";
import { ConfigProvider } from "antd";
import UsernameModal from "./components/Modal/Modal";
import { THEME } from "./theme";
import './App.css';
import { observer } from "mobx-react-lite";
import { store } from "./store/ChatStore";
import { io } from "socket.io-client";
import ChatsList from "./components/ChatsList/ChatsList";
import { toJS } from "mobx";
import Chat from "./components/Chat/Chat";
import { check } from "./http/userAPI";

const App: React.FC = observer(() => {
	const [showModal, setShowModal] = useState<boolean>(true);

	const checkAuth = useCallback(async () => {
		if (localStorage.getItem('token')) {
			const user = await check();
			if (user) {
				store.user = user;
				setShowModal(false);
			}
		}
	}, []);

	useEffect(() => {
		if (store.user) {
			store.socket = io("ws://localhost:5000", { transports: ['websocket', 'polling'], query: { user: JSON.stringify(toJS(store.user)) } });
		}
	}, [store.user]);
	
	useEffect(() => {
		checkAuth()
	}, []);

	return (
		<div className="app">
			<ConfigProvider
				theme={THEME}
			>
				{!showModal && (
					<>
						<div className="chats_list__container">
							<ChatsList />
						</div>
						<Chat />
					</>
				)}
				<UsernameModal show={showModal} setShow={setShowModal} />
			</ConfigProvider>
		</div>
	)
});

export default App;