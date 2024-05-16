import { Injectable } from '@nestjs/common';
import { Image } from './image.schema';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model, ObjectId } from 'mongoose';

@Injectable()
export class ImageService {
    constructor(
        @InjectModel(Image.name) private imageModel: Model<Image>
    ) {}

    async saveImages(files: Express.Multer.File[]) {
        const session = await this.imageModel.startSession();
        try {
			session.startTransaction();
            const imagesToSave = files.map(file => ({ image: { miemtype: file.mimetype, size: file.size, buffer: file.buffer } }));
            const images = await this.imageModel.insertMany(imagesToSave, { session });
            await session.commitTransaction();
            return images.map(image => image.id);
        } catch (error) {
            await session.abortTransaction();
		    console.error(error);
        }
        session.endSession();
    }

    async getImages(id: ObjectId[]) {
        const session = await this.imageModel.startSession();
        try {
            session.startTransaction();
            const images = await this.imageModel.find({ _id: { $in: id } }, {}, { session });
            await session.commitTransaction();
            return images;
        } catch (error) {
            await session.abortTransaction();
		    console.error(error);
        }
        session.endSession();
    }
}
