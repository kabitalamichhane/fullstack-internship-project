import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { stripe } from '../lib/stripe';
import { config, paymentsMocked } from '../config';
import { authenticate } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';
import { cancelOrder, createOrderFromCart, markOrderPaid } from '../services/order.service';
import { writeInvoicePdf } from '../services/invoice.service';

const router = Router();
router.use(authenticate);

const checkoutSchema = z.object({
  couponCode: z.string().trim().optional(),
  shippingAddress: z.object({
    fullName: z.string().min(2),
    line1: z.string().min(3),
    line2: z.string().optional(),
    city: z.string().min(2),
    state: z.string().optional(),
    postalCode: z.string().min(3),
    country: z.string().min(2),
    phone: z.string().min(6),
  }),
});

/**
 * Checkout: creates the order from the Redis cart, then
 *  - Stripe mode: returns a Stripe Checkout URL (test mode). Payment is confirmed by the webhook.
 *  - Mock mode:  marks the order as paid immediately.
 */
router.post(
  '/checkout',
  asyncHandler(async (req, res) => {
    const { shippingAddress, couponCode } = checkoutSchema.parse(req.body);
    const order = await createOrderFromCart(req.user!.id, shippingAddress, couponCode || undefined);

    if (paymentsMocked || !stripe) {
      await markOrderPaid(order.id);
      return res.status(201).json({ orderId: order.id, mocked: true, checkoutUrl: null });
    }

    const lineItems = order.vendorOrders.flatMap((vo) =>
      vo.items.map((i) => ({
        quantity: i.quantity,
        price_data: { currency: config.currency, unit_amount: i.unitPriceCents, product_data: { name: i.title } },
      })),
    );

    let discounts: { coupon: string }[] | undefined;
    if (order.discountCents > 0) {
      const c = await stripe.coupons.create({ amount_off: order.discountCents, currency: config.currency, duration: 'once', name: order.couponCode ?? 'Discount' });
      discounts = [{ coupon: c.id }];
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      discounts,
      customer_email: req.user!.email,
      client_reference_id: order.id,
      metadata: { orderId: order.id },
      // transfer_group links the charge with the vendor transfers made after payment
      payment_intent_data: { transfer_group: order.id, metadata: { orderId: order.id } },
      success_url: `${config.clientUrl}/orders/${order.id}?paid=1`,
      cancel_url: `${config.clientUrl}/cart?cancelled=${order.id}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    await prisma.order.update({ where: { id: order.id }, data: { checkoutSessionId: session.id } });
    res.status(201).json({ orderId: order.id, mocked: false, checkoutUrl: session.url });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: req.user!.id },
      include: { vendorOrders: { include: { items: true, vendor: { select: { storeName: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ orders });
  }),
);

async function findOwnOrder(id: string, userId: string, role: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { vendorOrders: { include: { items: true, vendor: { select: { storeName: true, userId: true } } } } },
  });
  const isVendorOnOrder = order?.vendorOrders.some((vo) => vo.vendor.userId === userId);
  if (!order || (order.userId !== userId && role !== 'ADMIN' && !isVendorOnOrder)) {
    throw new HttpError(404, 'Order not found');
  }
  return order;
}

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ order: await findOwnOrder(req.params.id, req.user!.id, req.user!.role) });
  }),
);

router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const order = await findOwnOrder(req.params.id, req.user!.id, req.user!.role);
    if (order.userId !== req.user!.id && req.user!.role !== 'ADMIN') throw new HttpError(403, 'Not allowed');
    await cancelOrder(order.id);
    res.json({ ok: true });
  }),
);

/** PDF invoice download. */
router.get(
  '/:id/invoice',
  asyncHandler(async (req, res) => {
    const order = await findOwnOrder(req.params.id, req.user!.id, req.user!.role);
    if (order.status === 'PENDING_PAYMENT' || order.status === 'CANCELLED') {
      throw new HttpError(400, 'Invoice is available after payment');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.id.slice(-8)}.pdf"`);
    await writeInvoicePdf(order.id, res);
  }),
);

export default router;
