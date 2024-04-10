import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Chat } from './chat.schema';
import { Chat as ChatType } from './chat.type';
import { Model } from 'mongoose';
import { CreateChatDto } from './dto/create-chat.dto';
import { ChatRepository } from './chat.repository';

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

    createChat(chatDto: CreateChatDto) {
        const newChat = this.chatDtoToChat(chatDto);
        return ChatRepository.create(newChat);
    }
}