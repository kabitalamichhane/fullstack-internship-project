import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { config } from '../config';

export const s3 = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  forcePathStyle: Boolean(config.s3.endpoint),
  credentials: config.s3.accessKeyId
    ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey }
    : undefined,
});

/** Public (CDN) URL for an object key. In production this is the CloudFront domain. */
export const cdnUrl = (key: string) => `${config.cdnBaseUrl}/${key}`;

/** Multipart streaming upload — works for large video files without loading them into memory. */
export async function uploadFile(localPath: string, key: string, contentType: string, cacheControl?: string) {
  await new Upload({
    client: s3,
    params: {
      Bucket: config.s3.bucket,
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: contentType,
      CacheControl: cacheControl,
    },
  }).done();
  return key;
}

export async function uploadBuffer(buffer: Buffer, folder: string, originalName: string, contentType: string) {
  const key = `${folder}/${crypto.randomUUID()}${path.extname(originalName).toLowerCase()}`;
  await s3.send(new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, Body: buffer, ContentType: contentType }));
  return cdnUrl(key);
}

export async function downloadToFile(key: string, localPath: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }));
  await pipeline(res.Body as Readable, fs.createWriteStream(localPath));
}
