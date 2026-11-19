import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, createSession, destroySession } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['STUDENT', 'INSTRUCTOR']).default('STUDENT'),
});

const safe = (u: { id: string; email: string; name: string; role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN' }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    if (await prisma.user.findUnique({ where: { email: data.email } })) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    const user = await prisma.user.create({
      data: { name: data.name, email: data.email, role: data.role, passwordHash: await bcrypt.hash(data.password, 10) },
    });
    res.status(201).json({ token: await createSession(safe(user)), user: safe(user) });
  }),
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Incorrect email or password');
    res.json({ token: await createSession(safe(user)), user: safe(user) });
  }),
);

router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    await destroySession(req.user!.sid);
    res.json({ ok: true });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, email: true, name: true, role: true, bio: true } });
    res.json({ user });
  }),
);

export default router;
