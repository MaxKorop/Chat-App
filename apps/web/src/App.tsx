import { ConfigProvider } from 'antd';
import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useState } from 'react';

import './App.css';
import { io } from 'socket.io-client';

import AuthModal from './components/Auth/AuthModal';
import Chat from './components/Chat/Chat';
import SidePanel from './components/SidePanel/SidePanel';
import { check } from './http/userAPI';
import { store } from './store/ChatStore';
import { uiStore } from './store/UIStore';
import { THEME } from './theme';

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
      // same origin: the Vite dev proxy (and Caddy in production) forwards /socket.io to the api
      store.socket = io({
        transports: ['websocket', 'polling'],
        query: { user: JSON.stringify(toJS(store.user)) },
      });
    }
  }, [store.user]);

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <div className="app">
      <ConfigProvider theme={THEME}>
        {!uiStore.showAuthModal && (
          <>
            <SidePanel />
            <Chat />
          </>
        )}
        <AuthModal />
      </ConfigProvider>
    </div>
  );
});

export default App;
