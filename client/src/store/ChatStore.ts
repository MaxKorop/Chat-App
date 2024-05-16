import { makeAutoObservable, runInAction, toJS } from "mobx";
import { Chat, Message, User } from "../types/types";
import { Socket } from "socket.io-client";
import EventEmitter from "events";

class ChatStore {
	events = new EventEmitter();
	private _chat: Chat | undefined;
	private _socket: Socket | null = null;
	private _user: User | null = null;
	private _userChats: Chat[] = [];
	private _userInfo: User | null = null;
	private _numberOfUnreadMessages: { chatId: string, unreadNumber: number }[] = [];

	constructor() {
		makeAutoObservable(this);
	}
	
	get chat() {
		return this._chat;
	}
	
	get socket() {
		return this._socket;
	}

	get user() {
		return this._user;
	}

	get userChats() {
		return this._userChats;
	}

	get userInfo() {
		return this._userInfo;
	}

	get numberOfUnreadMessages() {
		return this._numberOfUnreadMessages;
	}
	
	set chat(newChat) {
		this._chat = newChat;
	}
	
	set socket(newSocket) {
		this._socket = newSocket;
		this._socket?.on("connect", () => console.log("connected"));
		this._socket?.on("error", (errorMessage: { message: string }) => console.error(errorMessage.message));
		this._socket?.on("chatMessage", (message: Message) => runInAction(() => this._chat?.history.push(message)));
		this._socket?.on("chatJoined", ({ chat }) => runInAction(() => this._chat = chat));
		this._socket?.on("readMessage", ({ chat }: { chat: Chat }) => runInAction(() => {
			this._chat = chat;
			this.events.emit("updateUnreadMessages", chat);
		}));
		this._socket?.on("deletedMessage", ({ chatId, messageId }) => {
			runInAction(() => {
				if (chatId !== this._chat?._id) {
					const chat = this._userChats.find(chat => chat._id === chatId) as Chat;
					chat.history = chat.history.filter(message => message._id !== messageId);
					this._userChats = this._userChats.map(userChat => userChat._id !== chat._id ? userChat : chat);
					this.events.emit("updateUnreadMessages", chat);
				} else if (this._chat) {
					this._chat.history = this._chat.history.filter(message => message._id !== messageId);
					this.events.emit("updateUnreadMessages", this._chat);
				}
			})
		});
		this._socket?.on('editedMessage', ({ chatId, message }: { chatId: string, message: Message }) => {
			runInAction(() => {
				if (chatId !== this._chat?._id) {
					const chat = this._userChats.find(chat => chat._id === chatId) as Chat;
					chat.history = chat.history.map(chatMessage => chatMessage._id === message._id ? message : chatMessage);
					this.events.emit("updateUnreadMessages", chat);
				} else if (this._chat) {
					this._chat.history = this._chat.history.map(chatMessage => chatMessage._id === message._id ? message : chatMessage);
					this.events.emit("updateUnreadMessages", this._chat);
				}
			});
		});
	}

	set user(userObj) {
		this._user = userObj;
	}

	set userChats(value) {
		this._userChats = value;
	}

	set userInfo(value) {
		this._userInfo = value;
	}

	set numberOfUnreadMessages(value) {
		this._numberOfUnreadMessages = value;
	}

	countUnreadMessages(): { chatId: string, unreadNumber: number }[] {
		return this._userChats.map(chat => ({ chatId: chat._id, unreadNumber: chat.history.filter(message => !message.readBy.includes(this._user?._id as string)).length }));
	}
	
	countAndUpdateUnreadMessagesForChat(chat: Chat) {
		const numberOfUnreadInChat = chat.history.filter(message => !message.readBy.includes(this._user?._id as string)).length;
		const unread = this._numberOfUnreadMessages.find(unread => unread.chatId === chat._id);
		if (unread) {
			this._numberOfUnreadMessages[this._numberOfUnreadMessages.findIndex(unreadIndex => unreadIndex.chatId === unread.chatId)].unreadNumber = numberOfUnreadInChat;
		}
	}

	readMessage(messageId: string) {
		this.socket?.emit('messageRead', {
			chatId: this._chat?._id,
			messageId
		});
	}

	isUserChat() {
		if (this._user?.chats) {
			return toJS(this._user?.chats).some(chat => chat === this._chat?._id);
		}
	}
	
	sendMessage(payload: string, repliedTo: string | null = null, media: string[] = []) {
		this._socket?.emit("send", { chatId: this._chat?._id,  message: { payload, sentBy: this.user?._id, sentByName: this.user?.userName, readBy: [this._user?._id], repliedTo, media } });
	}

	joinChat(chatId: string) {
		this._socket?.emit("joinChat", { chatId });
	}

	deleteMessage(messageId: string) {
		this._socket?.emit("deleteMessage", { chatId: this._chat?._id, messageId });
	}

	editMessage(messageId: string, newPayload: string) {
		this._socket?.emit("editMessage", { chatId: this._chat?._id, messageId, newPayload });
	}
}

export const store = new ChatStore();