import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';
import { invalidate } from '../lib/redis';
import { indexProduct } from '../lib/elastic';

const router = Router();

router.get(
  '/product/:productId',
  asyncHandler(async (req, res) => {
    const reviews = await prisma.review.findMany({
      where: { productId: req.params.productId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ reviews });
  }),
);

const reviewSchema = z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().max(2000).optional() });

async function refreshRating(productId: string) {
  const agg = await prisma.review.aggregate({ where: { productId }, _avg: { rating: true }, _count: true });
  await prisma.product.update({
    where: { id: productId },
    data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10, ratingCount: agg._count },
  });
  await invalidate(`product:${productId}`);
  await indexProduct(productId);
}

/** Only customers who received the product (DELIVERED) can review it — "verified purchase". One review per user, re-posting updates it. */
router.post(
  '/product/:productId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rating, comment } = reviewSchema.parse(req.body);
    const productId = req.params.productId;
    const bought = await prisma.orderItem.count({
      where: { productId, vendorOrder: { status: 'DELIVERED', order: { userId: req.user!.id } } },
    });
    if (!bought) throw new HttpError(403, 'You can review a product after it has been delivered to you');

    const review = await prisma.review.upsert({
      where: { productId_userId: { productId, userId: req.user!.id } },
      create: { productId, userId: req.user!.id, rating, comment },
      update: { rating, comment },
    });
    await refreshRating(productId);
    res.status(201).json({ review });
  }),
);

router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review || (review.userId !== req.user!.id && req.user!.role !== 'ADMIN')) throw new HttpError(404, 'Review not found');
    await prisma.review.delete({ where: { id: review.id } });
    await refreshRating(review.productId);
    res.json({ ok: true });
  }),
);

export default router;
