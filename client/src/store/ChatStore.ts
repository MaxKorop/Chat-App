import { makeAutoObservable, runInAction, toJS } from "mobx";
import { Chat, Message, User } from "../types/types";
import { Socket } from "socket.io-client";

class ChatStore {
	private _chat: Chat | undefined;
	private _socket: Socket | null = null;
	private _user: User | null = null;
	private _userChats: Chat[] | null = null;

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
	
	set chat(newChat) {
		this._chat = newChat;
	}
	
	set socket(newSocket) {
		this._socket = newSocket;
		this._socket?.on("connect", () => console.log("connected"));
		this._socket?.on("error", (errorMessage: { message: string }) => console.log(errorMessage.message));
		this._socket?.on("chatMessage", (message: Message) => runInAction(() => this._chat?.history.push(message)));
		this._socket?.on("chatJoined", ({ chat }) => {
			console.log(chat)
			runInAction(() => this._chat = chat)
		});
	}

	set user(userObj) {
		this._user = userObj;
	}

	set userChats(value) {
		this._userChats = value;
	}

	isUserChat() {
		console.log(this._user?.chats, this._chat?._id);
		if (this._user?.chats) {
			return toJS(this._user?.chats).some(chat => chat === this._chat?._id);
		}
	}
	
	sendMessage(payload: string) {
		this._socket?.emit("send", { chatId: this._chat?._id,  message: { payload, sentBy: this.user?._id, sentByName: this.user?.userName } });
	}

	joinChat(chatId: string) {
		this._socket?.emit("joinChat", { chatId });
	}
}

export const store = new ChatStore();