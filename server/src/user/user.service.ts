import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './user.schema';
import mongoose, { Model, ObjectId } from 'mongoose';
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
        const token = this.jwtService.sign(user, { secret: String(process.env.JWT_SECRET) });

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

        const token = this.jwtService.sign(user, { secret: String(process.env.JWT_SECRET) });

        return { token };
    }

    async check(req: Request) {
        const oldTokenUser = req['user'];
        const { password, ...user } = (await this.userModel.findById(oldTokenUser?._id)).toObject();
        const token = this.jwtService.sign(user, { secret: String(process.env.JWT_SECRET) });
        return { token };
    }


    // Error with ObjectId
    async joinToChat(req: Request, chatId: string) {
        const user = req['user'];
        const findUser = await this.userModel.findById(user?._id);
        if (!findUser) {
            throw new UnauthorizedException();
        }
        const id = new mongoose.Types.ObjectId(chatId);
        if (findUser.chats.includes(id)) {
            throw new BadRequestException("User already in this chat.");
        }
        findUser.chats.push(id);
        findUser.save();
        const {password, ...updatedUser} = (await this.userModel.findById(user?._id)).toObject();
        const token = this.jwtService.sign(updatedUser, { secret: String(process.env.JWT_SECRET) });
        return { token };
    }
}
