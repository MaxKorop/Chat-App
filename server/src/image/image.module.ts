import { Module } from '@nestjs/common';
import { ImageService } from './image.service';
import { Image, ImageSchema } from './image.schema';
import { ImageController } from './image.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';

@Module({
	imports: [
		JwtModule.register({
			secret: String(process.env.JWT_SECRET),
			signOptions: { expiresIn: '24h' }
		}),
		MongooseModule.forFeature([
			{ name: Image.name, schema: ImageSchema }
		])
	],
	controllers: [ImageController],
	providers: [ImageService],
})
export class ImageModule {}