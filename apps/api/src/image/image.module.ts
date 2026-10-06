import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { ImageController } from './image.controller';
import { Image, ImageSchema } from './image.schema';
import { ImageService } from './image.service';

@Module({
  imports: [
    JwtModule.register({
      secret: String(process.env.JWT_SECRET),
      signOptions: { expiresIn: '24h' },
    }),
    MongooseModule.forFeature([{ name: Image.name, schema: ImageSchema }]),
  ],
  controllers: [ImageController],
  providers: [ImageService],
})
export class ImageModule {}
