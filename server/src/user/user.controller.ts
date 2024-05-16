import { Body, ClassSerializerInterceptor, Controller, Get, Post, Put, Query, Request, UseGuards, UseInterceptors } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto, LogInUserDto, ResponseUserDto, UpdateUserDto } from './dto/user.dto';
import { AuthGuard } from 'src/guards/auth.guard';
import { OnEvent } from '@nestjs/event-emitter';
import { CreateChatDto } from 'src/chat/dto/chat.dto';
import { User } from './user.type';

@Controller('user')
export class UserController {
	constructor(private readonly userService: UserService) { }

	@Post('logIn')
	async logIn(@Body() userDto: LogInUserDto): Promise<{ token: string }> {
		const user = this.userService.logIn(userDto);
		return user;
	}

	@Post('signUp')
	async signUp(@Body() userDto: CreateUserDto): Promise<{ token: string }> {
		return this.userService.signUp(userDto);
	}

	@UseGuards(AuthGuard)
	@Post('check')
	async check(@Request() req: Request): Promise<any> {
		return this.userService.check(req);
	}

	@UseGuards(AuthGuard)
	@Post('joinToChat')
	async joinToChat(@Request() req: Request, @Body() body: { chatId: string }) {
		return this.userService.joinToChat(req, body.chatId);
	}

	@UseGuards(AuthGuard)
	@UseInterceptors(ClassSerializerInterceptor)
	@Post('search')
	async searchUser(@Request() req: Request, @Body() body: { userName: string }): Promise<ResponseUserDto[]> {
		return this.userService.findUser(req, body.userName);
	}

	@UseGuards(AuthGuard)
	@Post('addFriend')
	async addFriend(@Request() req: Request, @Body() body: { userId: string }) {
		return this.userService.addFriend(req, body.userId);
	}

	@UseGuards(AuthGuard)
	@UseInterceptors(ClassSerializerInterceptor)
	@Get('friends')
	async getFriends(@Request() req: Request): Promise<ResponseUserDto[]> {
		return this.userService.getUserFriends(req);
	}

	@UseGuards(AuthGuard)
	@Get('userInfo')
	async getUserName(@Query() query: { id: string }) {
		return this.userService.getUserName(query.id);	
	}

	@UseGuards(AuthGuard)
	@Put('update')
	async updateUser(@Request() req: Request, @Body() newUser: UpdateUserDto) {
		return this.userService.updateUser(req, newUser);
	}

	@OnEvent('user.connect')
	async userConnect(payload: { user: User }) {
		this.userService.userConnect(payload);
	}

	@OnEvent('user.disconnect')
	async userDisconnect(payload: { user: User }) {
		this.userService.userDisconnect(payload);
	}

	@OnEvent('chat.created')
	async autoAddToChat(payload: CreateChatDto) {
		this.userService.autoAddToChat(payload);
	}
}
