import React, { useEffect, useRef } from "react";
import { MessageProps } from "../../../../types/componentsProps";
import "./Message.css";
import { observer } from "mobx-react-lite";
import { store } from "../../../../store/ChatStore";
import { useElementOnScreeen } from "../../../../hooks/useElementOnScreen";

const Message: React.FC<MessageProps> = observer(({ message, setHeightToScroll }) => {
    const [messageRef, isVisible] = useElementOnScreeen<HTMLDivElement>({
        root: null,
        rootMargin: "0px",
        threshold: 1.0
    });

    const { _id, payload, sentBy, sentByName, sentAt, repliedTo, readBy } = message;

    let messageSentBy = sentByName === store?.user?.userName ? "" : sentByName;
    const prevMessage = store.chat?.history[store.chat?.history.findIndex(msg => msg._id === message._id)];

    useEffect(() => {
        if (!messageSentBy.length && messageRef.current) messageRef.current.classList.add("message--my");
        if (!readBy.includes(store.user?._id as string) && messageRef.current && prevMessage?.readBy.includes(store.user?._id as string)) setHeightToScroll(messageRef.current.offsetTop - 100);
    }, []);

    useEffect(() => {
        if (isVisible) {
            if (!readBy.includes(store.user?._id as string)) {
                store.readMessage(_id);
            }
        }
    }, [isVisible]);

    return (
        <div ref={messageRef} className="message__wrapper">
            {repliedTo && <div className="message__replied"></div>}
            <span className="message__sentBy">{messageSentBy}</span>
            <span className="message__payload">{payload}</span>
            <span className="message__sentAt">{sentAt.toString().split("T")[1].slice(0, 5)}</span>
        </div>
    )
});

export default Message;