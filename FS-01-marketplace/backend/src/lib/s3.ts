import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import path from 'path';
import { config } from '../config';

export const s3 = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  forcePathStyle: Boolean(config.s3.endpoint), // needed for MinIO
  credentials: config.s3.accessKeyId
    ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey }
    : undefined,
});

export async function uploadImage(file: Express.Multer.File, folder: string): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
  const key = `${folder}/${crypto.randomUUID()}${ext}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }),
  );
  return `${config.s3.publicUrl}/${key}`;
}

export async function deleteImageByUrl(url: string) {
  if (!url.startsWith(config.s3.publicUrl)) return;
  const key = url.slice(config.s3.publicUrl.length + 1);
  await s3.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key })).catch(() => undefined);
}
