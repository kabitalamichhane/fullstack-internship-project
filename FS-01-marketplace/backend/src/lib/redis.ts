import Redis from 'ioredis';
import { config } from '../config';

// lazyConnect: the connection opens on first command, so importing this file in tests is safe.
export const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });

redis.on('error', (err) => console.error('[redis]', err.message));

/** Simple read-through cache helper. */
export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    /* cache unavailable: fall through to the database */
  }
  const value = await load();
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    /* ignore cache write errors */
  }
  return value;
}

export async function invalidate(...keys: string[]) {
  try {
    if (keys.length) await redis.del(...keys);
  } catch {
    /* ignore */
  }
}
