import { observer } from 'mobx-react-lite';
import React from 'react';

import { store } from '../../../store/ChatStore';
import { Chat, User } from '../../../types/types';
import ChatItem from '../ChatItem/ChatItem';

const ChatList: React.FC<{ focusOnSearch: boolean; chatList: Chat[] }> = observer(
  ({ focusOnSearch, chatList }) => {
    return (
      <div>
        {focusOnSearch
          ? chatList.map((chatItem: Chat) => <ChatItem key={chatItem._id} chatOrUser={chatItem} />)
          : store.userChats.map((chatItem: Chat) => (
              <ChatItem key={chatItem._id} chatOrUser={chatItem} />
            ))}
      </div>
    );
  },
);

export default ChatList;
