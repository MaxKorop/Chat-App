import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { User, UserSchema } from './user.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from 'src/strategies/jwt.strategy';

@Module({
    imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
            secret: String(process.env.JWT_SECRET),
            signOptions: { expiresIn: '24h' }
        }),
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])
    ],
    controllers: [UserController],
    providers: [UserService, JwtStrategy],
    exports: [JwtStrategy, PassportModule]
})
export class UserModule {}
