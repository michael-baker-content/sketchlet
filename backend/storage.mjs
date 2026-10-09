import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
let client;
export const drawingsBucket = () => process.env.DRAWINGS_BUCKET || 'drawings';
export function drawingStorage() {
  return client ||= new S3Client({ endpoint:process.env.AWS_ENDPOINT_URL_S3, region:process.env.AWS_REGION,
    forcePathStyle:true, credentials:{ accessKeyId:process.env.AWS_ACCESS_KEY_ID, secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY } });
}
export async function sendDrawingImage(res, key) {
  const object = await drawingStorage().send(new GetObjectCommand({ Bucket:drawingsBucket(), Key:key }));
  const bytes = await object.Body.transformToByteArray();
  // Recheck publication/session on every request, including previously viewed images.
  res.writeHead(200, { 'Content-Type':'image/png', 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(Buffer.from(bytes));
}
