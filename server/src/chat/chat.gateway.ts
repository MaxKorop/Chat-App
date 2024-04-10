import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CreateMessageDto } from './dto/create-message.dto';
import { ChatRepository } from './chat.repository';
import { Message } from './message.type';
import mongoose from 'mongoose';
import { TransformMessageDto } from 'src/pipes/message-tranform.pipe';

@WebSocketGateway({
	origin: 'http://localhost:3000'
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server;

	private wsConnections: Socket[] = [];

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
	sendMessage(@MessageBody(new TransformMessageDto()) { chatId, message }: { chatId: string, message: CreateMessageDto }) {
		const chat = ChatRepository.findById(chatId);
		if (chat) {
			ChatRepository.sendMessage(chatId, this.toMessageInstance(message));
			this.server.to(chat.id).emit("chatMessage", message);
		}
	}

	// Connect user to different chats (that means that connected socket == user online)
	@SubscribeMessage("joinChat")
	joinChat(@ConnectedSocket() client: Socket, @MessageBody() { chatId }: { chatId: string }) {
		const { userId } = client.handshake.query;
		const _id = new mongoose.Schema.Types.ObjectId(userId.toString());
		const chat = ChatRepository.findById(chatId);
		if (chat) {
			if (!chat.users.filter(id => JSON.stringify(id) === JSON.stringify(_id)).length) {
				ChatRepository.connectToChat(chatId, _id);
				client.join(chat.id);
				client.emit("chatJoined", { chat });
			} else {
				client.emit("error", { message: "This user is already connected to this chat" });
			}
		} else {
			client.emit("error", { message: "Chat does not exists" });
		}
	}
}
