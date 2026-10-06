import { Avatar, List, message } from 'antd';
import React, { useEffect, useState } from 'react';

import { getFriends } from '../../../../http/userAPI';
import { MessageError, User, errorMessage, normalizeTimeUk } from '../../../../types/types';

const FriendsList: React.FC = () => {
  const [userFriends, setUserFriends] = useState<User[]>([]);
  const [messageApi, contextHolder] = message.useMessage();

  const getUserFriends = async () => {
    setUserFriends(await getFriends());
  };

  useEffect(() => {
    try {
      getUserFriends();
    } catch (error) {
      if (error instanceof MessageError) {
        errorMessage(error.message, messageApi);
      }
    }
  }, []);

  return (
    <>
      {contextHolder}
      <List
        itemLayout="horizontal"
        bordered
        style={{ width: '120%' }}
        dataSource={userFriends}
        renderItem={(item) => (
          <List.Item>
            <List.Item.Meta
              avatar={<Avatar>{item.userName[0].toUpperCase()}</Avatar>}
              title={item.userName}
              description={`${item.online ? '' : 'Last time online'}: ${item.online ? 'online' : item.hideLastTimeOnline ? 'online — recently' : normalizeTimeUk(item.lastTimeOnline)}`}
            />
          </List.Item>
        )}
      />
    </>
  );
};

export default FriendsList;
