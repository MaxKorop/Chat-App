import { type LogInInput, logInSchema, type SignUpInput, signUpSchema } from '@chat/shared';
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser, type AuthUser } from '../../common/current-user.decorator';
import { Public } from '../../common/public.decorator';
import { AuthService } from './auth.service';

// 5 attempts per minute and client slows down password guessing and account spam
const STRICT = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(STRICT)
  @Post('sign-up')
  signUp(@Body({ schema: signUpSchema }) body: SignUpInput) {
    return this.auth.signUp(body);
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('log-in')
  logIn(@Body({ schema: logInSchema }) body: LogInInput) {
    return this.auth.logIn(body);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
