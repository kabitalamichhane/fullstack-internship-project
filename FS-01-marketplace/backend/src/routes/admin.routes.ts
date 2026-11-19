import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/http';
import { indexProduct } from '../lib/elastic';
import { invalidate } from '../lib/redis';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

const PAID = { notIn: ['PENDING_PAYMENT', 'CANCELLED'] as ('PENDING_PAYMENT' | 'CANCELLED')[] };

/** Admin analytics: GMV, commission earned, orders, top products, top vendors and daily revenue. */
router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 86400000);

    const [orderAgg, commissionAgg, customers, vendors, pendingVendors, products, statusCounts, topItems, daily, topVendorsRaw] =
      await Promise.all([
        prisma.order.aggregate({ where: { status: PAID }, _sum: { totalCents: true, discountCents: true }, _count: true, _avg: { totalCents: true } }),
        prisma.vendorOrder.aggregate({ where: { status: PAID }, _sum: { commissionCents: true, vendorPayoutCents: true } }),
        prisma.user.count({ where: { role: 'CUSTOMER' } }),
        prisma.vendor.count({ where: { approved: true } }),
        prisma.vendor.count({ where: { approved: false } }),
        prisma.product.count({ where: { isActive: true } }),
        prisma.order.groupBy({ by: ['status'], _count: true }),
        prisma.orderItem.groupBy({
          by: ['productId', 'title'],
          where: { vendorOrder: { status: PAID } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        }),
        prisma.$queryRaw<{ day: Date; revenue: bigint; orders: bigint }[]>`
          SELECT date_trunc('day', "paidAt") AS day, SUM("totalCents") AS revenue, COUNT(*) AS orders
          FROM "Order"
          WHERE "paidAt" IS NOT NULL AND "paidAt" >= ${since} AND status <> 'CANCELLED'
          GROUP BY 1 ORDER BY 1`,
        prisma.vendorOrder.groupBy({
          by: ['vendorId'],
          where: { status: PAID },
          _sum: { subtotalCents: true, commissionCents: true },
          orderBy: { _sum: { subtotalCents: 'desc' } },
          take: 5,
        }),
      ]);

    const vendorNames = await prisma.vendor.findMany({
      where: { id: { in: topVendorsRaw.map((v) => v.vendorId) } },
      select: { id: true, storeName: true },
    });

    res.json({
      totals: {
        gmvCents: orderAgg._sum.totalCents ?? 0,
        commissionCents: commissionAgg._sum.commissionCents ?? 0,
        vendorPayoutCents: commissionAgg._sum.vendorPayoutCents ?? 0,
        discountCents: orderAgg._sum.discountCents ?? 0,
        orders: orderAgg._count,
        avgOrderCents: Math.round(orderAgg._avg.totalCents ?? 0),
        customers,
        vendors,
        pendingVendors,
        products,
      },
      ordersByStatus: statusCounts.map((s) => ({ status: s.status, count: s._count })),
      topProducts: topItems.map((t) => ({ productId: t.productId, title: t.title, unitsSold: t._sum.quantity ?? 0 })),
      topVendors: topVendorsRaw.map((v) => ({
        vendorId: v.vendorId,
        storeName: vendorNames.find((n) => n.id === v.vendorId)?.storeName ?? 'Unknown',
        salesCents: v._sum.subtotalCents ?? 0,
        commissionCents: v._sum.commissionCents ?? 0,
      })),
      daily: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), revenueCents: Number(d.revenue), orders: Number(d.orders) })),
    });
  }),
);

router.get(
  '/vendors',
  asyncHandler(async (_req, res) => {
    const vendors = await prisma.vendor.findMany({
      include: { user: { select: { name: true, email: true } }, _count: { select: { products: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ vendors });
  }),
);

/** Approve or suspend a vendor. Their products appear in search only while approved. */
router.patch(
  '/vendors/:id',
  asyncHandler(async (req, res) => {
    const { approved } = z.object({ approved: z.boolean() }).parse(req.body);
    const vendor = await prisma.vendor.update({ where: { id: req.params.id }, data: { approved }, include: { products: { select: { id: true } } } });
    await Promise.all(vendor.products.map((p) => indexProduct(p.id)));
    await invalidate(...vendor.products.map((p) => `product:${p.id}`));
    res.json({ vendor });
  }),
);

router.get(
  '/orders',
  asyncHandler(async (_req, res) => {
    const orders = await prisma.order.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, email: true } }, vendorOrders: { select: { status: true, vendor: { select: { storeName: true } } } } },
    });
    res.json({ orders });
  }),
);

const categorySchema = z.object({ name: z.string().min(2), slug: z.string().regex(/^[a-z0-9-]+$/) });

router.post(
  '/categories',
  asyncHandler(async (req, res) => {
    const category = await prisma.category.create({ data: categorySchema.parse(req.body) });
    await invalidate('categories');
    res.status(201).json({ category });
  }),
);

export default router;
