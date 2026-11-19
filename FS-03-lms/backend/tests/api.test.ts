import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('LMS API smoke tests', () => {
  it('health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('protected routes need a token', async () => {
    for (const path of ['/api/courses/mine', '/api/instructor/dashboard', '/api/admin/stats', '/api/certificates']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
    expect((await request(app).post('/api/quizzes/abc/attempts').send({ answers: [0] })).status).toBe(401);
    expect((await request(app).post('/api/live/abc/token')).status).toBe(401);
  });

  it('validates registration', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'x', password: 'short' });
    expect(res.status).toBe(400);
  });
});
