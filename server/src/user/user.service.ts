import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './user.schema';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UserService {
    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        private jwtService: JwtService
    ) { }

    async logIn(userDto: CreateUserDto): Promise<{ token: string }> {
        const findUser = await this.userModel.findOne({ userName: userDto.userName });

        if (!findUser) throw new UnauthorizedException('Invalid credentials.');

        const isPasswordMatched = await bcrypt.compare(userDto.password, findUser.password); 

        if (!isPasswordMatched) {
            throw new UnauthorizedException('Invalid credentials.');
        }
        const { password, ...user } = findUser.toObject();
        const token = this.jwtService.sign(user);

        return { token };
    }

    async signUp(userDto: CreateUserDto): Promise<{ token: string }> {
        const findUser = await this.userModel.findOne({ userName: userDto.userName });

        if (findUser) {
            throw new UnauthorizedException('User with this username already exists.');
        }

        const hashedPassword = await bcrypt.hash(userDto.password, 10);

        const newUser = await this.userModel.create({
            userName: userDto.userName,
            password: hashedPassword,
        });

        const { password, ...user } = newUser.toObject();

        const token = this.jwtService.sign(user);

        return { token };
    }
}
