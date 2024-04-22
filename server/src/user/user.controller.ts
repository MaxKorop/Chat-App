import { Body, Controller, HttpException, Post } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/user.dto';

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

	@Post('check')
	async check(): Promise<any> {
		
	}
}
