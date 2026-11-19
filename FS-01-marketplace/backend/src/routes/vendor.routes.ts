import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';
import { uploadImage } from '../lib/s3';
import { stripe } from '../lib/stripe';
import { config, paymentsMocked } from '../config';
import { canTransition, aggregateStatus } from '../utils/pricing';
import { indexProduct } from '../lib/elastic';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate, requireRole('VENDOR'));

async function myVendor(userId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { userId } });
  if (!vendor) throw new HttpError(404, 'Vendor profile not found');
  return vendor;
}

/** Vendor onboarding: view and update store profile. */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ vendor: await myVendor(req.user!.id) });
  }),
);

const profileSchema = z.object({
  storeName: z.string().min(2).max(80).optional(),
  description: z.string().max(1000).optional(),
});

router.put(
  '/me',
  upload.single('logo'),
  asyncHandler(async (req, res) => {
    const vendor = await myVendor(req.user!.id);
    const data = profileSchema.parse(req.body);
    const logoUrl = req.file ? await uploadImage(req.file, `vendors/${vendor.id}`) : undefined;
    const updated = await prisma.vendor.update({ where: { id: vendor.id }, data: { ...data, logoUrl } });
    res.json({ vendor: updated });
  }),
);

/**
 * Stripe Connect onboarding: creates an Express connected account for the vendor
 * and returns a hosted onboarding link. In mock mode we just store a fake account id.
 */
router.post(
  '/stripe/onboard',
  asyncHandler(async (req, res) => {
    const vendor = await myVendor(req.user!.id);
    if (paymentsMocked || !stripe) {
      const updated = await prisma.vendor.update({
        where: { id: vendor.id },
        data: { stripeAccountId: vendor.stripeAccountId ?? `acct_mock_${vendor.id}` },
      });
      return res.json({ mocked: true, stripeAccountId: updated.stripeAccountId, url: null });
    }
    let accountId = vendor.stripeAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: req.user!.email,
        capabilities: { transfers: { requested: true } },
        business_profile: { name: vendor.storeName },
      });
      accountId = account.id;
      await prisma.vendor.update({ where: { id: vendor.id }, data: { stripeAccountId: accountId } });
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${config.clientUrl}/vendor?stripe=refresh`,
      return_url: `${config.clientUrl}/vendor?stripe=done`,
      type: 'account_onboarding',
    });
    res.json({ url: link.url, stripeAccountId: accountId });
  }),
);

/** Vendor's own products (including inactive ones). */
router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const vendor = await myVendor(req.user!.id);
    const products = await prisma.product.findMany({
      where: { vendorId: vendor.id },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ products });
  }),
);

/** Orders containing this vendor's products. */
router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const vendor = await myVendor(req.user!.id);
    const orders = await prisma.vendorOrder.findMany({
      where: { vendorId: vendor.id, status: { not: 'PENDING_PAYMENT' } },
      include: { items: true, order: { select: { id: true, createdAt: true, shippingAddress: true, user: { select: { name: true, email: true } } } } },
      orderBy: { order: { createdAt: 'desc' } },
    });
    res.json({ orders });
  }),
);

const statusSchema = z.object({ status: z.enum(['PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED']) });

/** Order lifecycle: vendor moves its part of the order PLACED → PACKED → SHIPPED → DELIVERED. */
router.patch(
  '/orders/:id/status',
  asyncHandler(async (req, res) => {
    const vendor = await myVendor(req.user!.id);
    const { status } = statusSchema.parse(req.body);
    const vo = await prisma.vendorOrder.findFirst({ where: { id: req.params.id, vendorId: vendor.id }, include: { items: true } });
    if (!vo) throw new HttpError(404, 'Order not found');
    if (!canTransition(vo.status, status)) throw new HttpError(400, `Cannot change status from ${vo.status} to ${status}`);

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.vendorOrder.update({ where: { id: vo.id }, data: { status } });
      if (status === 'CANCELLED') {
        // Return stock when a vendor cancels.
        for (const item of vo.items) {
          await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        }
      }
      const siblings = await tx.vendorOrder.findMany({ where: { orderId: vo.orderId }, select: { status: true } });
      await tx.order.update({
        where: { id: vo.orderId },
        data: { status: aggregateStatus(siblings.map((s) => s.status)) as never },
      });
      return u;
    });
    if (status === 'CANCELLED') await Promise.all(vo.items.map((i) => indexProduct(i.productId)));
    res.json({ vendorOrder: updated });
  }),
);

/** Simple vendor stats for the dashboard. */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const vendor = await myVendor(req.user!.id);
    const agg = await prisma.vendorOrder.aggregate({
      where: { vendorId: vendor.id, status: { notIn: ['PENDING_PAYMENT', 'CANCELLED'] } },
      _sum: { subtotalCents: true, vendorPayoutCents: true, commissionCents: true },
      _count: true,
    });
    const productCount = await prisma.product.count({ where: { vendorId: vendor.id } });
    res.json({
      orders: agg._count,
      grossCents: agg._sum.subtotalCents ?? 0,
      payoutCents: agg._sum.vendorPayoutCents ?? 0,
      commissionCents: agg._sum.commissionCents ?? 0,
      productCount,
    });
  }),
);

export default router;
