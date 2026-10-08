import type { LogInInput, MeDto, SignUpInput } from '@chat/shared';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { isUniqueViolation } from '../../common/prisma-errors';
import type { User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toMe } from '../users/users.mapper';

const BCRYPT_COST = 10;

export type Session = { accessToken: string; user: MeDto };

@Injectable()
export class AuthService {
  // Compared against when the username does not exist, so an unknown user takes as long to reject
  // as a wrong password and response time does not reveal which accounts exist.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async signUp(input: SignUpInput): Promise<Session> {
    const email = input.email.toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    try {
      const user = await this.prisma.user.create({
        data: { username: input.username, email, passwordHash },
      });
      return this.session(user);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const taken = await this.prisma.user.findFirst({
        where: { OR: [{ username: input.username }, { email }] },
      });
      throw new ConflictException(
        taken?.username === input.username
          ? 'This username is already taken'
          : 'This e-mail is already registered',
      );
    }
  }

  async logIn(input: LogInInput): Promise<Session> {
    const user = await this.prisma.user.findUnique({ where: { username: input.username } });
    const matches = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? (await this.getDummyHash()),
    );
    if (!user || !matches) throw new UnauthorizedException('Invalid username or password');
    return this.session(user);
  }

  async me(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException(); // the account was deleted after the token was issued
    return toMe(user);
  }

  /** The token carries only the identity. Everything else is read from the database when needed. */
  private async session(user: User): Promise<Session> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, username: user.username });
    return { accessToken, user: toMe(user) };
  }

  private getDummyHash() {
    this.dummyHash ??= bcrypt.hash('timing-equalizer', BCRYPT_COST);
    return this.dummyHash;
  }
}
