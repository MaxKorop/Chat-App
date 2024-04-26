import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/user.dto';
import { AuthGuard } from 'src/guards/auth.guard';

@Controller('user')
export class UserController {
	constructor(private readonly userService: UserService) { }

	@Post('logIn')
	async logIn(@Body() userDto: CreateUserDto): Promise<{ token: string }> {
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
}
