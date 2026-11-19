import 'dotenv/config';

const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && v !== '' && v !== undefined ? Number(v) : d);

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 5000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5174',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6380',
  s3: {
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: process.env.S3_BUCKET ?? 'lms-media',
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
  /** CloudFront distribution URL in production; MinIO bucket URL locally. */
  cdnBaseUrl: (process.env.CDN_BASE_URL ?? 'http://localhost:9010/lms-media').replace(/\/$/, ''),
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe',
  livekit: {
    url: process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
    apiKey: process.env.LIVEKIT_API_KEY ?? 'devkey',
    apiSecret: process.env.LIVEKIT_API_SECRET ?? 'secret',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  },
  platformFeePercent: num(process.env.PLATFORM_FEE_PERCENT, 20),
  currency: process.env.CURRENCY ?? 'usd',
};

export const paymentsMocked = !config.stripe.secretKey;
