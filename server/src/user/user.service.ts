import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './user.schema';
import { User as UserType } from './user.type';
import mongoose, { Model } from 'mongoose';
import { CreateUserDto, LogInUserDto, ResponseUserDto, UpdateUserDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { CreateChatDto } from 'src/chat/dto/chat.dto';

@Injectable()
export class UserService {
    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        private jwtService: JwtService
    ) { }

    async logIn(userDto: LogInUserDto): Promise<{ token: string }> {
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
            email: userDto.email,
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
        await findUser.save();
        const {password, ...updatedUser} = (await this.userModel.findById(user._id)).toObject();
        const token = this.jwtService.sign(updatedUser, { secret: String(process.env.JWT_SECRET) });
        return { token };
    }

    async findUser(req: Request, userName: string) {
        const { _id } = req['user'];
        if (!userName.trim().length) return [];
        const regexp = new RegExp(userName, 'i');
        return (await this.userModel.find({ userName: { $regex: regexp }, hideInSearch: false, canAddToFriends: true, _id: { $ne: _id } })).map(friend => new ResponseUserDto(friend.toObject()));
    }

    async addFriend(req: Request, userId: string) {
        const userFromToken = req['user'];
        const user = await this.userModel.findById(userFromToken._id);
        const userToAdd = await this.userModel.findById(userId);
        if (!userToAdd.canAddToFriends) throw new BadRequestException('Cannot add this user to friends, user does not allow this.')
        user.friends.push(userToAdd._id);
        userToAdd.friends.push(user._id);
        await user.save();
        await userToAdd.save();
        const { password, ...userWithFriend } = (await this.userModel.findById(user._id)).toObject();
        const token = this.jwtService.sign(userWithFriend, { secret: String(process.env.JWT_SECRET) });
        return { token };
    }

    async getUserFriends(req: Request) {
        const userFromToken = req['user'];
        const user = await this.userModel.findById(userFromToken._id);
        return (await this.userModel.find({ _id: { $in: user.friends } })).map(friend => new ResponseUserDto(friend.toObject()));
    }

    async getUserName(id: string) {
        return (await this.userModel.findById(id)).userName;
    }

    async updateUser(req: Request, newUserDto: UpdateUserDto) {
        const user: UpdateUserDto = req['user'];
        if (user.userName !== newUserDto.userName) {
            const userFromDb = await this.userModel.findOne({ userName: newUserDto.userName });
            if (userFromDb) {
                throw new BadRequestException('This username is already taken.');
            }
        }
        const { password, ...updatedUser } = (await this.userModel.findOneAndUpdate({ userName: user.userName }, { $set: { ...newUserDto } }, { new: true })).toObject();
        const token = this.jwtService.sign(updatedUser, { secret: String(process.env.JWT_SECRET) });
        return { token };
    }

    async autoAddToChat(chat: CreateChatDto) {
        const { users } = chat;
        await this.userModel.updateMany({ _id: { $in: users } }, { $addToSet: { chats: chat._id } });
    }

    async userConnect(payload: { user: UserType }) {
        await this.userModel.findOneAndUpdate({ userName: payload.user.userName }, { $set: { online: true } });
        return 'OK';
    }

    async userDisconnect(payload: { user: UserType }) {
        await this.userModel.findOneAndUpdate({ userName: payload.user.userName }, { $set: { online: false, lastTimeOnline: new Date() } });
        return 'OK';
    }
}