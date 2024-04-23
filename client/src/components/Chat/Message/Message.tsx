import React, { useEffect, useRef } from "react";
import { MessageProps } from "../../../types/componentsProps";
import "./Message.css";
import { observer } from "mobx-react-lite";
import { store } from "../../../store/ChatStore";

const Message: React.FC<MessageProps> = observer(({ message }) => {
    const myMessageRef = useRef<HTMLDivElement>(null);

    const { payload, sentBy, sentAt, repliedTo } = message;

    let messageSentBy = sentBy === store?.user?.userName ? "" : sentBy;

    useEffect(() => {
        if (!messageSentBy.length && myMessageRef.current) myMessageRef.current.classList.add("message--my");
    }, []);

    return (
        <div ref={myMessageRef} className="message__wrapper">
            {repliedTo && <div className="message__replied"></div>}
            <span className="message__sentBy">{messageSentBy}</span>
            <span className="message__payload">{payload}</span>
            <span className="message__sentAt">{sentAt.toString().split("T")[1].slice(0, 5)}</span>
        </div>
    )
});

export default Message;