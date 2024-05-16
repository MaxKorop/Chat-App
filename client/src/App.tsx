import React, { useCallback, useEffect, useState } from "react";
import { ConfigProvider } from "antd";
import AuthModal from "./components/Auth/AuthModal";
import { THEME } from "./theme";
import './App.css';
import { observer } from "mobx-react-lite";
import { store } from "./store/ChatStore";
import { io } from "socket.io-client";
import SidePanel from "./components/SidePanel/SidePanel";
import { toJS } from "mobx";
import Chat from "./components/Chat/Chat";
import { check } from "./http/userAPI";
import { uiStore } from "./store/UIStore";

const App: React.FC = observer(() => {
	const checkAuth = useCallback(async () => {
		if (localStorage.getItem('token')) {
			const user = await check();
			if (user) {
				store.user = user;
				uiStore.showAuthModal = false;
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
				{!uiStore.showAuthModal && (
					<>
						<SidePanel />
						<Chat />
					</>
				)}
				<AuthModal />
			</ConfigProvider>
		</div>
	)
});

export default App;