import { Controller, Get, HttpStatus, ParseFilePipeBuilder, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { ImageService } from './image.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ObjectId } from 'mongoose';

@Controller('image')
export class ImageController {
	constructor(private readonly imageService: ImageService) { }

	@UseGuards(AuthGuard)
	@Post('upload')
	@UseInterceptors(FilesInterceptor('images'))
	async uploadImage(@UploadedFiles(
		new ParseFilePipeBuilder()
			.addMaxSizeValidator({
				maxSize: 1048576 //1 Mb
			})
			.build({
				errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY
			})
	) files: Express.Multer.File[]) {
		return await this.imageService.saveImages(files);
	}

	@UseGuards(AuthGuard)
	@Get()
	async getImages(@Query() query: { id: ObjectId[] }) {
		return await this.imageService.getImages(query.id);
	}
}
