import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';
import { computeDiscount } from '../utils/pricing';
import { getCartView } from '../services/cart.service';

const router = Router();

/** Customer: check a coupon against the current cart before checkout. */
router.post(
  '/validate',
  authenticate,
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().trim().min(1) }).parse(req.body);
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon) throw new HttpError(404, 'Invalid coupon code');
    const cart = await getCartView(req.user!.id);
    const check = computeDiscount(coupon, cart.subtotalCents);
    if (!check.ok) throw new HttpError(400, check.reason);
    res.json({ code: coupon.code, discountCents: check.discountCents, totalCents: cart.subtotalCents - check.discountCents });
  }),
);

// ---------- Admin coupon management ----------
const couponSchema = z.object({
  code: z.string().trim().min(3).max(30).transform((s) => s.toUpperCase()),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.coerce.number().int().positive(),
  minOrderCents: z.coerce.number().int().min(0).default(0),
  maxUses: z.coerce.number().int().positive().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  active: z.boolean().default(true),
});

router.get(
  '/',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json({ coupons: await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }) });
  }),
);

router.post(
  '/',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const data = couponSchema.parse(req.body);
    if (data.type === 'PERCENT' && data.value > 100) throw new HttpError(400, 'Percent coupons must be 1-100');
    res.status(201).json({ coupon: await prisma.coupon.create({ data }) });
  }),
);

router.patch(
  '/:id',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const data = couponSchema.partial().parse(req.body);
    res.json({ coupon: await prisma.coupon.update({ where: { id: req.params.id }, data }) });
  }),
);

router.delete(
  '/:id',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.coupon.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

export default router;
