import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

// These tests don't need a database: they check routing, validation and access control.
const app = createApp();

describe('API smoke tests', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('protected routes reject requests without a token', async () => {
    for (const path of ['/api/cart', '/api/orders', '/api/vendor/products', '/api/admin/analytics']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it('rejects an invalid JWT', async () => {
    const res = await request(app).get('/api/cart').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('validates registration input', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'bad', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('unknown routes return 404 JSON', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
  });
});
