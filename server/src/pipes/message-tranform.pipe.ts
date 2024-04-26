import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import { ObjectId } from 'mongoose';
import { CreateMessageDto } from 'src/chat/dto/message.dto';

@Injectable()
export class TransformMessageDto implements PipeTransform {
    transform(value: any, metadata: ArgumentMetadata): {chatId: string, message: CreateMessageDto} {
        const { chatId, message }: { chatId: string, message: { payload: string, sentBy: ObjectId, sentByName: string } } = value;
        const defaultValues = new CreateMessageDto(message.payload, message.sentBy, message.sentByName);

        return {
            chatId,
            message: {
                ...message,
                ...defaultValues,
            }
        };
    }
}