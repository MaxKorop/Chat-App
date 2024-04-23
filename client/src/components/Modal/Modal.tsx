import React, { ChangeEvent, useState } from "react";
import { Input, Modal, Space } from "antd";
import { observer } from "mobx-react-lite";
import { store } from "../../store/ChatStore";
import LogIn from "./LogIn/LogIn";
import SignUp from "./SignUp/SignUp";
import { logIn, signUp } from "../../http/userAPI";

const UsernameModal: React.FC<{ show: boolean, setShow: (arg0: boolean) => void }> = observer(({ show, setShow }) => {
    const [userName, setUserName] = useState<string>("");
    const [password, setPassword] = useState<string>("");
    const [email, setEmail] = useState<string>("");
    const [isLogIn, setIsLogIn] = useState<boolean>(true);
    const emailRegExp = /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i

    const checkAndSetEmail = (value: string) => {
        console.log(email.match(emailRegExp));
        setEmail(value);
    }

    const auth = async () => {
        if (isLogIn) {
            const user = await logIn(userName, password);
            if (user) {
                store.user = user;
                return true;
            }
        } else {
            const user = await signUp(userName, password, email);
            if (user) {
                store.user = user;
                return true;
            }
        }
    }

    return (
        <Modal
            title="Input your name here to texting with people"
            open={show}
            onOk={async () => {
                const isAuthorized = await auth();
                if (isAuthorized) setShow(false);
            }}
        >
            {isLogIn && <LogIn
                userName={userName}
                setUserName={setUserName}
                password={password}
                setPassword={setPassword}
                setIsLogin={setIsLogIn}
            />}
            {!isLogIn && <SignUp
                userName={userName}
                setUserName={setUserName}
                password={password}
                setPassword={setPassword}
                setIsLogin={setIsLogIn}
                email={email}
                setEmail={checkAndSetEmail}
            />}
        </Modal>
    )
});

export default UsernameModal;