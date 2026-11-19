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
  // Admins are created by seed only; public sign-up is customer or vendor.
  role: z.enum(['CUSTOMER', 'VENDOR']).default('CUSTOMER'),
  storeName: z.string().min(2).max(80).optional(),
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    if (data.role === 'VENDOR' && !data.storeName) throw new HttpError(400, 'storeName is required for vendors');

    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new HttpError(409, 'An account with this email already exists');

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: data.role,
        vendor: data.role === 'VENDOR' ? { create: { storeName: data.storeName! } } : undefined,
      },
    });
    const safe = { id: user.id, email: user.email, name: user.name, role: user.role };
    const token = await createSession(safe);
    res.status(201).json({ token, user: safe });
  }),
);

const loginSchema = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) });

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, 'Incorrect email or password');
    }
    const safe = { id: user.id, email: user.email, name: user.name, role: user.role };
    const token = await createSession(safe);
    res.json({ token, user: safe });
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
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, name: true, role: true, vendor: true },
    });
    res.json({ user });
  }),
);

export default router;
