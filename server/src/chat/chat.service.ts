import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Chat } from './chat.schema';
import { Chat as ChatType } from './chat.type';
import { Model } from 'mongoose';
import { CreateChatDto } from './dto/chat.dto';
import { User } from 'src/user/user.type';

@Injectable()
export class ChatService {
    constructor(@InjectModel(Chat.name) private chatModel: Model<Chat>) {}
    
    chatDtoToChat(dto: CreateChatDto): ChatType {
        const chatInstance: ChatType = {
            chatName: dto.chatName,
            users:  dto.users,
            details: dto.details,
            private: dto.private,
            history: dto.history,
            createdAt: dto.createdAt
        };
        return chatInstance;
    }

    async createChat(chatDto: CreateChatDto) {
        const chat = await this.chatModel.findOne({ chatName: chatDto.chatName });
        if (chat) {
            throw new BadRequestException('Chat with this name already exists')
        }
        const newChat = await this.chatModel.create(chatDto);
        return newChat;
    }

    async searchChat(name: string) {
        if (!name.trim().length) return [];
        const regexp = new RegExp(name, 'i');
        return await this.chatModel.find({ chatName: { $regex: regexp }, public: true });
    }

    async getUsersChats(req: Request) {
        const user = req['user'] as User;
        const chatsId = user.chats;
        const chats = await this.chatModel.find({ '_id': { $in: chatsId } });
        return chats;
    }

    async joinChat(req: Request, chatId: string) {
        const user = req['user'] as User;
        const { _id } = user;
        const chat = await this.chatModel.findById(chatId);
        if (chat) {
            if (chat.users.includes(_id)) {
                throw new BadRequestException("User already in this chat.");
            }
            chat.users.push(_id);
            chat.save();
        }
        return chat;
    }
}