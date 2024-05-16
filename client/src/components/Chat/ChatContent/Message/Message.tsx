import React, { ChangeEvent, useEffect, useRef, useState } from "react";
import { MessageProps } from "../../../../types/componentsProps";
import "./Message.css";
import { observer } from "mobx-react-lite";
import { store } from "../../../../store/ChatStore";
import { useElementOnScreeen } from "../../../../hooks/useElementOnScreen";
import { Image as ImageType, normalizeTimeUk, toBase64 } from "../../../../types/types";
import { Image, Input, Popover, Space } from "antd";
import MessageOperations from "./MessageOperations/MessageOperations";
import { uiStore } from "../../../../store/UIStore";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import MessageReply from "./MessageReply/MessageReply";
import { getImages } from "../../../../http/chatAPI";

const Message: React.FC<MessageProps> = observer(({ message, setHeightToScroll }) => {
    const [isEdit, setIsEdit] = useState<boolean>(false);
    const [editedPayload, setEditedPayload] = useState<string>(message.payload);
    const [images, setImages] = useState<ImageType[]>([]);
    const [messageRef, isVisible] = useElementOnScreeen<HTMLDivElement>({
        root: null,
        rootMargin: "0px",
        threshold: 1.0
    });

    const { _id, payload, sentBy, sentByName, sentAt, repliedTo, readBy } = message;

    let messageSentBy = sentByName === store?.user?.userName ? "" : sentByName;
    const prevMessage = store.chat?.history[store.chat?.history.findIndex(msg => msg._id === message._id)];

    useEffect(() => {
        if (!readBy.includes(store.user?._id as string) && messageRef.current && prevMessage?.readBy.includes(store.user?._id as string)) setHeightToScroll(messageRef.current.offsetTop - 100);

        // Click on reply, when this this message is repliedTo
        const onReplyClick = (repliedTo: string) => {
            if (messageRef.current && repliedTo === message._id) {
                setHeightToScroll(messageRef.current.offsetTop - 100);
                setTimeout(() => {
                    messageRef.current?.classList.add('message__wrapper-reply');
                    setTimeout(() => {
                        messageRef.current?.classList.remove('message__wrapper-reply');
                    }, 300);
                }, 200);
            }
        }
        
        store.events.on("replyClick", onReplyClick);

        return () => {
            store.events.off("replyClick", onReplyClick);
        }
    }, []);

    const getImagesForMessage = async (id: string[]) => {
        const imagesForMessage = await getImages(id);
        setImages(imagesForMessage);
    }

    useEffect(() => {
        if (isVisible) {
            if (message.media?.length && !images.length) {
                getImagesForMessage(message.media);
            }
            if (!readBy.includes(store.user?._id as string)) {
                store.readMessage(_id);
            }
        }
    }, [isVisible]);

    const onEnterPress = () => {
        store.editMessage(message._id, editedPayload);
        setIsEdit(false);
    }

    const onEscPress = () => {
        setIsEdit(false);
    }

    return (
        <Popover
            onOpenChange={openState => openState ? uiStore.selectedMessageId = message._id : uiStore.selectedMessageId = ''}
            destroyTooltipOnHide
            placement="top"
            content={<MessageOperations messageId={message._id} messageSender={sentBy} setIsEdit={setIsEdit} />}
            trigger={'contextMenu'}
        >
            <div ref={messageRef} className={!messageSentBy.length ? "message__wrapper message--my" : "message__wrapper"}>
                <span className="message__sentBy">{messageSentBy}</span>
                {message.repliedTo?.length ? <MessageReply repliedTo={message.repliedTo} /> : <></>}
                {images.length ? (
                    <div className="message__wrapper-images">
                        {images.map(image =>
                            <Image
                                alt={`image from ${message.sentByName}`}
                                src={`data:${image.image.mimetype};base64, ${image.image.buffer}`}
                                key={image._id}
                            />
                        )}
                    </div>
                )
                    :
                    <>
                    </>
                }
                {isEdit ?
                    <Input
                        autoFocus
                        value={editedPayload}
                        onKeyDown={(e) => e.key === 'Enter' ? onEnterPress() : e.key === 'Escape' ? onEscPress() : null}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setEditedPayload(e.target.value)}
                        suffix={(<Space direction="horizontal" size={'small'}>
                            <CheckOutlined
                                onClick={() => { store.editMessage(message._id, editedPayload); setIsEdit(false); }}
                            />
                            <CloseOutlined
                                onClick={() => setIsEdit(false)}
                            />
                        </Space>)}
                    /> :
                    <span className="message__payload">{payload}</span>}
                <Popover placement="bottom" content={normalizeTimeUk(sentAt, 'DD-MM-YY HH:mm:ss')} >
                    <span className="message__sentAt">{normalizeTimeUk(sentAt)?.split(' ')[1]}</span>
                </Popover>
            </div>
        </Popover>
    )
});

export default Message;