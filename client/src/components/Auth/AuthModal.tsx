import React, { useRef, useState } from "react";
import { Button, InputRef, Modal, message } from "antd";
import { observer } from "mobx-react-lite";
import { store } from "../../store/ChatStore";
import { uiStore } from "../../store/UIStore";
import LogIn from "./LogIn/LogIn";
import SignUp from "./SignUp/SignUp";
import { logIn, signUp } from "../../http/userAPI";
import { MessageError, errorMessage } from "../../types/types";

const AuthModal: React.FC = observer(() => {
    const userNameRef = useRef<InputRef>(null);
    const passwordRef = useRef<InputRef>(null);
    const emailRef = useRef<InputRef>(null);
    const [isLogIn, setIsLogIn] = useState<boolean>(true);
    const [messageApi, contextHolder] = message.useMessage();
    // const emailRegExp = /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i

    // const checkAndSetEmail = (value: string) => {
    //     console.log(email.match(emailRegExp));
    //     setEmail(value);
    // }

    const auth = async () => {
        try {
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
                closable={false}
                title="Authorization"
                open={uiStore.showAuthModal}
                footer={(
                    <Button
                        type="primary"
                        onClick={async () => {
                            const isAuthorized = await auth();
                            if (isAuthorized) uiStore.showAuthModal = false;
                        }}
                    >
                        {isLogIn ? "Log In" : "Sign Up"}
                    </Button>
                )}
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
        </>
    )
});

export default AuthModal;