import { EditOutlined, QuestionCircleOutlined, SettingOutlined } from "@ant-design/icons";
import { Avatar, Button, Input, Modal, Space, Switch, Tooltip, Typography, message } from "antd";
import { observer } from "mobx-react-lite";
import React, { ChangeEvent, useState } from "react";
import { store } from "../../../store/ChatStore";
import { uiStore } from "../../../store/UIStore";
import "./UserSettings.css";
import FriendsList from "./FriendsList/FriendsList";
import { MessageError, UpdateUser, User, errorMessage } from "../../../types/types";
import { updateUser } from "../../../http/userAPI";
import { MessageInstance } from "antd/es/message/interface";

const { Title } = Typography;

const UserSettings: React.FC = observer(() => {
    const [editable, setEditable] = useState<boolean>(false);
    const [userName, setUserName] = useState<string | undefined>(store.user?.userName);
    const [aboutMe, setAboutMe] = useState<string | undefined>(store.user?.aboutMe);
    const [hideLastTimeOnline, setHideLastTimeOnline] = useState<boolean | undefined>(store.user?.hideLastTimeOnline);
    const [hideInSearch, setHideInSearch] = useState<boolean | undefined>(store.user?.hideInSearch);
    const [canAddToFriends, setCanAddToFriends] = useState<boolean | undefined>(store.user?.canAddToFriends);
    const [messageApi, contextHolder] = message.useMessage();

    const logOut = () => {
        localStorage.setItem('token', '');
        store.chat = undefined;
        store.userChats = [];
        store.user = null;
        store.socket?.disconnect();
        uiStore.showAuthModal = true;
        uiStore.showUserSettings = false;
    }

    const formUpdatedUser = (): UpdateUser | User => {
        if (editable) {
            return {
                userName: userName as string,
                aboutMe: aboutMe as string,
                hideLastTimeOnline: hideLastTimeOnline as boolean,
                hideInSearch: hideInSearch as boolean,
                canAddToFriends: canAddToFriends as boolean
            }
        }
        return store.user as User;
    }
    
    const clearStates = () => {
        setUserName(store.user?.userName);
        setAboutMe(store.user?.aboutMe);
        setHideLastTimeOnline(store.user?.hideLastTimeOnline);
        setHideInSearch(store.user?.hideInSearch);
        setCanAddToFriends(store.user?.canAddToFriends);
        return;
    }

    const updateUserInfo = async () => {
        try {
            store.user = await updateUser(formUpdatedUser());
        } catch (error) {
            if (error instanceof MessageError) {
                errorMessage(error.message, messageApi);
            }
        }
    }

    return (
        <>
            {contextHolder}
            <div className="side_panel__user_settings_container">
                <SettingOutlined style={{color: 'white', fontSize: 25, margin: 10}} onClick={() => uiStore.showUserSettings = true} />
                <Modal
                    destroyOnClose
                    title={<><span style={{ marginRight: 20 }}>Your information</span><EditOutlined onClick={() => { setEditable(prev => !prev); if (editable) clearStates(); }}/></>}
                    open={uiStore.showUserSettings}
                    afterClose={() => setEditable(false)}
                    footer={(
                        <Button disabled={editable} danger={!editable} onClick={() => logOut()}>Log Out</Button>
                    )}
                    onCancel={() => uiStore.showUserSettings = false}
                >
                    <Space
                        size={'large'}
                        direction="vertical"
                    >
                        <div className="user_settings__container-title">
                            {editable ? (<>
                                <span style={{marginRight: 20, fontWeight: 600}}>
                                    Username:
                                </span>
                                <Input maxLength={25} value={userName} onChange={(e: ChangeEvent<HTMLInputElement>) => setUserName(e.target.value)} />
                            </>) : (<>
                                <Avatar style={{ marginTop: 10, marginRight: 10 }}>{store.user?.userName[0].toUpperCase()}</Avatar>
                                <Title>{store.user?.userName}</Title>
                            </>)}
                        </div>
                        { editable ? (<div className="user_settings__container-about">
                            <span style={{marginRight: 20, fontWeight: 600}}>
                                About Me:
                            </span>
                            <Input.TextArea maxLength={50} value={aboutMe} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setAboutMe(e.target.value)} />
                        </div>) : store.user?.aboutMe.length ? <div className="user_settings__container-about">
                            <span style={{marginRight: 20, fontWeight: 600}}>
                                About Me:
                            </span>
                            <span>{store.user?.aboutMe}</span>
                        </div> : <></>}
                        <div className="user_settings__container-email">
                            <span style={{marginRight: 20, fontWeight: 600}}>
                                Email:
                            </span>
                            <span>{store.user?.email}</span>
                        </div>
                        <div className="user_settings__container-hide_online">
                            <span style={{marginRight: 20, fontWeight: 600}}>
                            <Tooltip title="Can other users see when you were online last time?"><QuestionCircleOutlined style={{marginRight: 10}} /></Tooltip>Hide last time online:
                            </span>
                            <Switch disabled={!editable} value={hideLastTimeOnline} onChange={(checked: boolean) => setHideLastTimeOnline(checked)} />
                        </div>
                        <div className="user_settings__container-hide_search">
                            <span style={{marginRight: 20, fontWeight: 600}}>
                                <Tooltip title="Can other users find you in search?"><QuestionCircleOutlined style={{marginRight: 10}} /></Tooltip>Hide in search:
                            </span>
                            <Switch disabled={!editable} value={hideInSearch} onChange={(checked: boolean) => setHideInSearch(checked)} />
                        </div>
                        <div className="user_settings__container-add_to_friends">
                            <span style={{marginRight: 20, fontWeight: 600}}>
                                <Tooltip title="Can other users add you to friends?"><QuestionCircleOutlined style={{marginRight: 10}} /></Tooltip>Can be added to friends:
                            </span>
                            <Switch disabled={!editable} value={canAddToFriends} onChange={(checked: boolean) => setCanAddToFriends(checked)} />
                        </div>
                        {!editable ? <FriendsList /> : <Button onClick={() => updateUserInfo()} type="primary">Update information</Button>}
                    </Space>
                </Modal>
            </div>
        </>
    )
});

export default UserSettings;