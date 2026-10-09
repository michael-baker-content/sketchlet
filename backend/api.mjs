import { neon } from '@neondatabase/serverless';
import { createGalleryHandler } from './gallery-handler.mjs';
import { drawingStorage, drawingsBucket, sendDrawingImage } from './storage.mjs';

export const handleApi = createGalleryHandler({
  sql:neon(process.env.DATABASE_URL), storage:drawingStorage(), bucket:drawingsBucket(), sendImage:sendDrawingImage,
});
