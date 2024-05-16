import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import * as mongoose from "mongoose";

export type ImageDocument = HydratedDocument<Image>;

@Schema()
export class Image {
    @Prop({ required: true })
    image: mongoose.Schema.Types.Mixed;
}

export const ImageSchema = SchemaFactory.createForClass(Image);