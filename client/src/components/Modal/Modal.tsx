import React, { ChangeEvent, useRef, useState } from "react";
import { Input, InputRef, Modal, Space } from "antd";
import { observer } from "mobx-react-lite";
import { store } from "../../store/ChatStore";
import LogIn from "./LogIn/LogIn";
import SignUp from "./SignUp/SignUp";
import { logIn, signUp } from "../../http/userAPI";

const UsernameModal: React.FC<{ show: boolean, setShow: (arg0: boolean) => void }> = observer(({ show, setShow }) => {
    const userNameRef = useRef<InputRef>(null);
    const passwordRef = useRef<InputRef>(null);
    const emailRef = useRef<InputRef>(null);
    const [email, setEmail] = useState<string>("");
    const [isLogIn, setIsLogIn] = useState<boolean>(true);
    const emailRegExp = /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i

    const checkAndSetEmail = (value: string) => {
        console.log(email.match(emailRegExp));
        setEmail(value);
    }

    const auth = async () => {
        if (isLogIn && userNameRef.current && passwordRef.current) {
            const user = await logIn(userNameRef.current.input?.value as string, passwordRef.current.input?.value as string);
            if (user) {
                store.user = user;
                return true;
            }
        } else if (userNameRef.current && passwordRef.current && emailRef.current) {
            const user = await signUp(userNameRef.current.input?.value as string, passwordRef.current.input?.value as string, emailRef.current.input?.value as string);
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
                userName={userNameRef}
                password={passwordRef}
                setIsLogin={setIsLogIn}
            />}
            {!isLogIn && <SignUp
                userName={userNameRef}
                password={passwordRef}
                email={emailRef}
                setIsLogin={setIsLogIn}
            />}
        </Modal>
    )
});

export default UsernameModal;