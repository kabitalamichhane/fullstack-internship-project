import { describe, expect, it, vi } from 'vitest';
import { cached, redis } from '../src/lib/redis';

describe('Redis cache fallback', () => {
  it('loads from the database without contacting disconnected Redis', async () => {
    const get = vi.spyOn(redis, 'get');
    const set = vi.spyOn(redis, 'set');
    const load = vi.fn(async () => 'from database');

    try {
      expect(redis.status).not.toBe('ready');
      await expect(cached('product:1', 60, load)).resolves.toBe('from database');
      expect(load).toHaveBeenCalledOnce();
      expect(get).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});
