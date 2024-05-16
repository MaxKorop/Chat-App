import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CreateMessageDto } from './dto/message.dto';
import mongoose, { Model } from 'mongoose';
import { TransformMessageDto } from 'src/pipes/message-tranform.pipe';
import { InjectModel } from '@nestjs/mongoose';
import { Chat } from './chat.schema';
import { User } from 'src/user/user.type';
import { EventEmitter2 } from '@nestjs/event-emitter';

@WebSocketGateway({
	origin: 'http://localhost:3000'
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server;

	private wsConnections: Socket[] = [];

	constructor(
		@InjectModel('Chat') private chatModel: Model<Chat>,
		private eventEmmiter: EventEmitter2
	) { }

	handleConnection(@ConnectedSocket() client: Socket, ...args: any[]) {
		this.wsConnections.push(client);
		this.eventEmmiter.emit("user.connect", { user: (JSON.parse(client.handshake.query['user'] as string) as User) });
	}

	handleDisconnect(@ConnectedSocket() client: Socket) {
		this.wsConnections = this.wsConnections.filter((socket: Socket) => socket.id !== client.id);
		this.eventEmmiter.emit("user.disconnect", { user: (JSON.parse(client.handshake.query['user'] as string) as User) });
	}

	@SubscribeMessage("send")
	async sendMessage(@MessageBody(new TransformMessageDto()) { chatId, message }: { chatId: string, message: CreateMessageDto }) {
		const chat = await this.chatModel.findById(chatId);
		if (chat) {
			chat.history.push(message);
			chat.save();
			this.server.to(chat.id).emit("chatMessage", message);
		}
	}

	@SubscribeMessage('deleteMessage')
	async deleteMessage(@MessageBody() { chatId, messageId }: { chatId: string, messageId: string }) {
		const chat = await this.chatModel.findById(chatId);
		if (chat) {
			const session = await this.chatModel.startSession();
			try {
				session.startTransaction();
				const updatedChat = await this.chatModel.findOneAndUpdate(
					{ _id: chatId },
					{ $pull: { history: { _id: messageId } } },
					{ session, new: true }
				);
				if (!updatedChat.history.find(message => message._id === messageId)) {
					this.server.to(chatId).emit('deletedMessage', { chatId, messageId });
				}
				await session.commitTransaction();
			} catch (error) {
				await session.abortTransaction();
				console.error(error);
			}
			session.endSession();
		}
	}

	@SubscribeMessage("editMessage")
	async editMessage(@MessageBody() { chatId, messageId, newPayload }: { chatId: string, messageId: string, newPayload: string }) {
		const chat = await this.chatModel.findById(chatId);
		if (chat) {
			const session = await this.chatModel.startSession();
			try {
				session.startTransaction();
				const updatedChat = await this.chatModel.findOneAndUpdate(
					{ _id: chatId, 'history._id': messageId },
					{
						$set: { "history.$.payload": newPayload, "history.$.modified": true }
					},
					{ session, new: true }
				);
				if (!updatedChat.history.find(message => (message.payload !== newPayload) && (message._id === messageId))) {
					this.server.to(chatId).emit('editedMessage', { chatId, message: updatedChat.history.find(message => (message._id === messageId)) });
				}
				await session.commitTransaction();
			} catch (error) {
				await session.abortTransaction();
				console.error(error);
			}
			session.endSession();
		}
	}

	// Connect user to different chats (that means that connected socket == user online)
	@SubscribeMessage("joinChat")
	async joinToChatting(@ConnectedSocket() client: Socket, @MessageBody() { chatId }: { chatId: string }) {
		// const user = JSON.parse(client.handshake.query.user as string) as User;
		const chat = await this.chatModel.findById(chatId);
		if (chat) {
			client.join(chat.id);
			client.emit("chatJoined", { chat: chat.toObject() });
			client.emit("error", { message: "This user is already connected to this chat" });
		} else {
			client.emit("error", { message: "Chat does not exists" });
		}
	}

	@SubscribeMessage("messageRead")
	async readMessage(@ConnectedSocket() client: Socket, @MessageBody() { chatId, messageId }: { chatId: string, messageId: string }) {
		const chat = await this.chatModel.findById(chatId);
		const userId = (JSON.parse(client.handshake.query?.user as string) as User)._id;
		if (chat) {
			const session = await this.chatModel.startSession();
			try {
				session.startTransaction();
				const updatedChat = await this.chatModel.findOneAndUpdate(
					{ _id: chatId, 'history._id': messageId },
					{ $push: { 'history.$.readBy': userId } },
					{ session, new: true }
				);
				if (updatedChat) {
					client.emit('readMessage', { chat: updatedChat });
				}
				await session.commitTransaction();
			} catch (error) {
				await session.abortTransaction();
				console.error(error);
			}
			session.endSession();
		}
	}
}
