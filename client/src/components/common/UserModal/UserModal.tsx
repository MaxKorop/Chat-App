import React from "react";
import { Button, Modal, Space } from "antd";
import { observer } from "mobx-react-lite";
import { store } from "../../../store/ChatStore";
import { InfoCircleOutlined, UserAddOutlined, UserOutlined } from "@ant-design/icons";
import { addToFriends } from "../../../http/userAPI";
import Title from "antd/es/typography/Title";
import './UserModal.css';

const UserModal: React.FC<{ onCancel: Function }> = observer(({ onCancel }) => {

    const onClickAdd = async () => {
        const user = await addToFriends(store.userInfo?._id as string);
        console.log(user);
        store.user = user;
        onCancel();
    }

    return (
        <Modal
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
                    User Name:
                    <Title style={{fontSize: 32, marginTop: 5}}>
                        {store.userInfo?.userName}
                    </Title>
                </div>
                <div>
                    About: {store.userInfo?.aboutMe}
                </div>
                <div className="user_modal__last_time_online">
                    <span>{store.userInfo?.online ? '' : 'Last time online:'}</span>
                    <span>{store.userInfo?.online ? 'online' : store.userInfo?.lastTimeOnline?.toString()}</span>
                </div>
            </Space>
        </Modal>
    )
});

export default UserModal;