import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CreateMessageDto } from './dto/message.dto';
import { Message } from './message.type';
import mongoose, { Model } from 'mongoose';
import { TransformMessageDto } from 'src/pipes/message-tranform.pipe';
import { InjectModel } from '@nestjs/mongoose';
import { Chat } from './chat.schema';
import { User } from 'src/user/user.type';

@WebSocketGateway({
	origin: 'http://localhost:3000'
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server;

	private wsConnections: Socket[] = [];

	constructor(@InjectModel(Chat.name) private chatModel: Model<Chat>) {}

	toMessageInstance(dto: CreateMessageDto): Message {
        const message: Message = {
            type: dto.type,
            status: dto.status,
            payload: dto.payload,
            sentBy: dto.sentBy,
            sentAt: dto.sentAt,
            repliedTo: dto.repliedTo,
            modified: dto.modified,
            translatedFrom: dto.translatedFrom
        };
        return message;
    }

	handleConnection(@ConnectedSocket() client: Socket, ...args: any[]) {
		this.wsConnections.push(client);
	}

	handleDisconnect(@ConnectedSocket() client: Socket) {
		this.wsConnections = this.wsConnections.filter((socket: Socket) => socket.id !== client.id);
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

	// Connect user to different chats (that means that connected socket == user online)
	@SubscribeMessage("joinChat")
	async joinToChatting(@ConnectedSocket() client: Socket, @MessageBody() { chatId }: { chatId: string }) {
		// const user = JSON.parse(client.handshake.query.user as string) as User;
		const chat = await this.chatModel.findById(chatId);
		if (chat /*&& user.chats.includes(chat._id)*/) {
			client.join(chat.id);
			client.emit("chatJoined", { chat: chat.toObject() });
			client.emit("error", { message: "This user is already connected to this chat" });
		} else {
			client.emit("error", { message: "Chat does not exists" });
		}
	}
}
