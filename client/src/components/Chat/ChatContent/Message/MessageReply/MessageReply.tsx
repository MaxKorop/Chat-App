import { observer } from 'mobx-react-lite';
import React from 'react';
import { store } from '../../../../../store/ChatStore';

const MessageReply: React.FC<{ repliedTo: string }> = observer(({ repliedTo }) => {
    const repliedToMessage = store.chat?.history.find(message => message._id === repliedTo); 

    const handleClick = () => {
        store.events.emit("replyClick", repliedTo);
    }

    return (
        <div className='message_reply__container-message' onClick={() => handleClick()}>
            <span style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{repliedToMessage?.sentByName}</span>
            <div className='message_reply__payload'>
                <span style={{fontSize: 13}}>{repliedToMessage?.payload}</span>
            </div>
        </div>
    )
});

export default MessageReply;