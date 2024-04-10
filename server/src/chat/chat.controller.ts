import { Body, Controller, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';

@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) { }
    
    @Post()
    @UsePipes(new ValidationPipe({ transform: true, transformOptions: { exposeDefaultValues: true } }))
    async createChat(@Body() createChatDto: CreateChatDto) {
        return this.chatService.createChat(createChatDto);
    }
}
