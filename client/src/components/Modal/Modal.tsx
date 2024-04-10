import React, { ChangeEvent, useState } from "react";
import { Input, Modal } from "antd";
import { observer } from "mobx-react-lite";
import { store } from "../../store/ChatStore";

const UsernameModal: React.FC<{ show: boolean, setShow: (arg0: boolean) => void }> = observer(({ show, setShow }) => {
    const [userName, setUserName] = useState<string>("");

    return (
        <Modal
            title="Input your name here to texting with people"
            open={show}
            onOk={() => {
                store.userName = userName;
                setShow(false);
            }}
        >
            <Input
                placeholder="Type your name here..."
                value={userName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setUserName(e.target.value)}
                style={{
                    width: "100%"
                }}
            />
        </Modal>
    )
});

export default UsernameModal;