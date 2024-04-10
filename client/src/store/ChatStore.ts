import { makeAutoObservable, runInAction } from "mobx";
import { Chat, Message } from "../types/types";
import { Socket } from "socket.io-client";

class ChatStore {
	private _chat: Chat | undefined;
	private _userName: string = "";
	private _socket: Socket | undefined;

	constructor() {
		makeAutoObservable(this);
	}

	
	get chat() {
		return this._chat;
	}
	
	get userName() {
		return this._userName;
	}
	
	get socket() {
		return this._socket;
	}
	
	set chat(newChat) {
		this._chat = newChat;
	}
	
	set userName(newUserName) {
		this._userName = newUserName;
	}
	
	set socket(newSocket) {
		this._socket = newSocket;
		console.log(this.socket);
		this._socket?.on("connect", () => console.log("connected"));
		this._socket?.on("error", (errorMessage: { message: string }) => console.log(errorMessage.message));
		this._socket?.on("chatMessage", (message: Message) => runInAction(() => this._chat?.history.push(message)));
		this._socket?.on("chatJoined", ({ chat }) => runInAction(() => this._chat = chat));
	}
	
	sendMessage(payload: string) {
		this._socket?.emit("send", { chatId: this._chat?.id,  message: { payload, sentBy: this.userName } });
	}

	joinChat(chatId: string) {
		this._socket?.emit("joinChat", { chatId });
	}
}

export const store = new ChatStore();