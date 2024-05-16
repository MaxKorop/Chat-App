import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import { Chat } from 'src/chat/chat.schema';
import { CreateChatDto } from 'src/chat/dto/chat.dto';

@Injectable()
export class TransformChatDto implements PipeTransform {
    transform(value: any, metadata: ArgumentMetadata) {
        const dto: Chat = value;
        const defaultValues = new CreateChatDto(dto.users, dto.chatName, value.privateChat, value.publicChat, dto.details);

        return {
            ...dto,
            ...defaultValues
        };
    }
}