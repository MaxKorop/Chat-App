import { Body, Controller, Get, Post, Query, Request, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateChatDto, JoinChatDto } from './dto/chat.dto';
import { Chat } from './chat.schema';
import { TransformChatDto } from 'src/pipes/chat-transform.pipe';
import { AuthGuard } from 'src/guards/auth.guard';

@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) { }
    
    @UseGuards(AuthGuard)
    @Post('create')
    @UsePipes(new ValidationPipe({ transform: true, transformOptions: { exposeDefaultValues: true } }))
    async createChat(@Body(new TransformChatDto()) createChatDto: CreateChatDto): Promise<Chat> {
        return this.chatService.createChat(createChatDto);
    }

    @UseGuards(AuthGuard)
    @Get('search')
    async searchChats(@Query('chatName') name: string): Promise<Chat[]> {
        return this.chatService.searchChat(name);
    }

    @UseGuards(AuthGuard)
    @Get('user')
    getAllUsersChats(@Request() req: Request) {
        return this.chatService.getUsersChats(req);
    }

    @UseGuards(AuthGuard)
    @Post('join')
    async joinChat(@Request() req: Request, @Body() chat: JoinChatDto) {
        return this.chatService.joinChat(req, chat.chatId);
    }
}
