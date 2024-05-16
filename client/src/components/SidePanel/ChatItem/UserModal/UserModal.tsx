import React from "react";
import { Avatar, Badge, Button, Modal, Space, Tooltip, message } from "antd";
import { observer } from "mobx-react-lite";
import { store } from "../../../../store/ChatStore";
import { InfoCircleOutlined, UserAddOutlined, UserOutlined } from "@ant-design/icons";
import { addToFriends } from "../../../../http/userAPI";
import Title from "antd/es/typography/Title";
import './UserModal.css';
import { MessageError, errorMessage, normalizeTimeUk } from "../../../../types/types";
import moment from "moment";

const UserModal: React.FC<{ onCancel: Function }> = observer(({ onCancel }) => {
    const [messageApi, contextHolder] = message.useMessage();

    const onClickAdd = async () => {
        try {
            const user = await addToFriends(store.userInfo?._id as string);
            store.user = user;
            onCancel();
        } catch (error) {
            if (error instanceof MessageError) {
                errorMessage(error.message, messageApi);
            }
        }
    }

    return (
        <>
            {contextHolder}
            <Modal
                destroyOnClose
                title={
                    <div>
                        <InfoCircleOutlined /> User info
                    </div>
                }
                open={store.userInfo ? true : false}
                footer={
                    <>
                        {!store.user?.friends.includes(store.userInfo?._id as string) ?
                            (<Button
                                type="primary"
                                onClick={() => onClickAdd()}
                            >
                                <UserAddOutlined />Add to friends
                            </Button>) : (<Button
                                type="default"
                                disabled={true}
                            >
                                <UserOutlined />Already friend
                            </Button>)
                        }
                        
                    </>
                }
                onOk={() => store.userInfo = null}
                onCancel={() => onCancel()}
            >
                <Space
                    direction="vertical"
                    size={'middle'}
                    style={{width: '100%'}}
                >
                    <div>
                        <div>
                            User Name:
                            <Title style={{fontSize: 32, marginTop: 5, display: 'flex', flexDirection: 'row', alignItems: 'flex-end'}}>
                                {store.userInfo?.online ? (
                                    <Tooltip title="User is online now">
                                        <Badge dot={store.userInfo?.online} color="blue" offset={[-13, 26]} style={{ width: 10, height: 10 }}>
                                            <Avatar style={{ marginRight: 10 }}>
                                                {store.userInfo?.userName[0].toUpperCase()}
                                            </Avatar>
                                        </Badge>
                                    </Tooltip>
                                ) : (
                                    <Badge dot={store.userInfo?.online} color="blue" offset={[-13, 26]} style={{ width: 10, height: 10 }}>
                                        <Avatar style={{ marginRight: 10 }}>
                                            {store.userInfo?.userName[0].toUpperCase()}
                                        </Avatar>
                                    </Badge>
                                )}
                                <span>{store.userInfo?.userName}</span>
                            </Title>
                        </div>
                    </div>
                    {store.userInfo?.aboutMe.length ? (<div>
                        About: {store.userInfo?.aboutMe}
                    </div>) : <></>}
                    <div className="user_modal__last_time_online">
                        <span>{store.userInfo?.online ? '' : 'Last time online:'}</span>
                        <span>{store.userInfo?.online ? '' : normalizeTimeUk(store.userInfo?.lastTimeOnline as Date)}</span>
                    </div>
                </Space>
            </Modal>
        </>
    )
});

export default UserModal;