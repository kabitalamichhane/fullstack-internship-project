import Redis from 'ioredis';
import { config } from '../config';

// Used for sessions. BullMQ needs maxRetriesPerRequest: null, so it gets its own connection (see queue.ts).
export const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
redis.on('error', (err) => console.error('[redis]', err.message));

export const createBullConnection = () => new Redis(config.redisUrl, { maxRetriesPerRequest: null });
