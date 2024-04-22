import { Body, Controller, Get, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/chat.dto';
import { Chat } from './chat.schema';
import { TransformChatDto } from 'src/pipes/chat-transform.pipe';

@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) { }
    
    @Post()
    @UsePipes(new ValidationPipe({ transform: true, transformOptions: { exposeDefaultValues: true } }))
    async createChat(@Body(new TransformChatDto()) createChatDto: CreateChatDto): Promise<Chat | { message: string }> {
        return this.chatService.createChat(createChatDto);
    }

    @Get()
    async searchChats(@Query('chatName') name: string): Promise<Chat[] | { message: string }> {
        return this.chatService.searchChat(name);
    }
}
