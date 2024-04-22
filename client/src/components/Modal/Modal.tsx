import React, { ChangeEvent, useState } from "react";
import { Input, Modal, Space } from "antd";
import { observer } from "mobx-react-lite";
import { store } from "../../store/ChatStore";
import LogIn from "./LogIn/LogIn";
import SignUp from "./SignUp/SignUp";

const UsernameModal: React.FC<{ show: boolean, setShow: (arg0: boolean) => void }> = observer(({ show, setShow }) => {
    const [userName, setUserName] = useState<string>("");
    const [password, setPassword] = useState<string>("");
    const [isLogIn, setIsLogIn] = useState<boolean>(true);

    return (
        <Modal
            title="Input your name here to texting with people"
            open={show}
            onOk={() => {
                store.userName = userName;
                setShow(false);
            }}
        >
            {isLogIn && <LogIn userName={userName} setUserName={setUserName} password={password} setPassword={setPassword} setIsLogin={setIsLogIn} />}
            {!isLogIn && <SignUp userName={userName} setUserName={setUserName} password={password} setPassword={setPassword} setIsLogin={setIsLogIn} />}
        </Modal>
    )
});

export default UsernameModal;