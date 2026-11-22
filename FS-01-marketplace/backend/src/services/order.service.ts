import { prisma } from '../lib/prisma';
import { stripe } from '../lib/stripe';
import { config } from '../config';
import { computeDiscount, splitOrder } from '../utils/pricing';
import { HttpError } from '../utils/http';
import { clearCart, getCartView } from './cart.service';
import { indexProduct } from '../lib/elastic';

export type ShippingAddress = {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  phone: string;
};

/**
 * Turn the user's cart into an Order with one VendorOrder per vendor.
 * Stock is reserved immediately (decremented) so two customers can't buy the last item.
 */
export async function createOrderFromCart(userId: string, shippingAddress: ShippingAddress, couponCode?: string) {
  const cart = await getCartView(userId);
  if (cart.items.length === 0) throw new HttpError(400, 'Your cart is empty');

  for (const item of cart.items) {
    if (item.quantity > item.stock) throw new HttpError(400, `"${item.title}" has only ${item.stock} left`);
  }

  let discountCents = 0;
  let appliedCode: string | undefined;
  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });
    if (!coupon) throw new HttpError(400, 'Invalid coupon code');
    const check = computeDiscount(coupon, cart.subtotalCents);
    if (!check.ok) throw new HttpError(400, check.reason);
    discountCents = check.discountCents;
    appliedCode = coupon.code;
  }

  // Group cart lines by vendor.
  const byVendor = new Map<string, typeof cart.items>();
  for (const item of cart.items) {
    byVendor.set(item.vendorId, [...(byVendor.get(item.vendorId) ?? []), item]);
  }
  const splits = splitOrder(
    [...byVendor.entries()].map(([vendorId, items]) => ({
      vendorId,
      subtotalCents: items.reduce((s, i) => s + i.lineTotalCents, 0),
    })),
    discountCents,
    config.commissionPercent,
  );

  const order = await prisma.$transaction(async (tx) => {
    // Reserve stock atomically: only succeeds if enough stock is still available.
    for (const item of cart.items) {
      const result = await tx.product.updateMany({
        where: { id: item.productId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      if (result.count === 0) throw new HttpError(409, `"${item.title}" just sold out. Please update your cart.`);
    }

    return tx.order.create({
      data: {
        userId,
        subtotalCents: cart.subtotalCents,
        discountCents,
        totalCents: cart.subtotalCents - discountCents,
        couponCode: appliedCode,
        shippingAddress,
        vendorOrders: {
          create: splits.map((s) => ({
            vendorId: s.vendorId,
            subtotalCents: s.subtotalCents,
            discountCents: s.discountCents,
            commissionCents: s.commissionCents,
            vendorPayoutCents: s.vendorPayoutCents,
            items: {
              create: byVendor.get(s.vendorId)!.map((i) => ({
                productId: i.productId,
                title: i.title,
                unitPriceCents: i.unitPriceCents,
                quantity: i.quantity,
              })),
            },
          })),
        },
      },
      include: { vendorOrders: { include: { items: true } } },
    });
  });

  await Promise.all(cart.items.map((i) => indexProduct(i.productId)));
  return order;
}

/**
 * Called once payment succeeds (Stripe webhook or mock mode):
 * marks the order PLACED, counts the coupon use, clears the cart and
 * pays each vendor their share via Stripe Connect transfers (platform keeps the commission).
 */
export async function markOrderPaid(orderId: string, paymentIntentId?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { vendorOrders: { include: { vendor: true } } },
  });
  if (!order || order.status !== 'PENDING_PAYMENT') return order; // idempotent: webhooks can repeat

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { status: 'PLACED', paidAt: new Date(), paymentIntentId },
    }),
    prisma.vendorOrder.updateMany({ where: { orderId }, data: { status: 'PLACED' } }),
    ...(order.couponCode
      ? [prisma.coupon.update({ where: { code: order.couponCode }, data: { usedCount: { increment: 1 } } })]
      : []),
  ]);
  await clearCart(order.userId).catch(() => undefined);

  if (stripe && paymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;
    for (const vo of order.vendorOrders) {
      const dest = vo.vendor.stripeAccountId;
      if (!dest || dest.startsWith('acct_mock_') || vo.vendorPayoutCents <= 0) continue;
      try {
        const transfer = await stripe.transfers.create({
          amount: vo.vendorPayoutCents,
          currency: config.currency,
          destination: dest,
          transfer_group: order.id,
          source_transaction: chargeId,
        });
        await prisma.vendorOrder.update({ where: { id: vo.id }, data: { transferId: transfer.id } });
      } catch (err) {
        // Vendor hasn't finished Stripe onboarding: payout stays pending and can be retried by admin.
        console.error(`[payments] transfer to ${dest} failed:`, (err as Error).message);
      }
    }
  } else {
    // Mock mode: record a fake transfer id so the dashboards show the split.
    await Promise.all(
      order.vendorOrders.map((vo) =>
        prisma.vendorOrder.update({ where: { id: vo.id }, data: { transferId: `tr_mock_${vo.id}` } }),
      ),
    );
  }
  return order;
}

/** Cancel an unpaid or not-yet-packed order and give the stock back. */
export async function cancelOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { vendorOrders: { include: { items: true } } },
  });
  if (!order) throw new HttpError(404, 'Order not found');
  if (!['PENDING_PAYMENT', 'PLACED'].includes(order.status)) {
    throw new HttpError(400, 'This order is already being processed and cannot be cancelled');
  }
  const items = order.vendorOrders.flatMap((vo) => vo.items);
  await prisma.$transaction([
    ...items.map((i) =>
      prisma.product.update({ where: { id: i.productId }, data: { stock: { increment: i.quantity } } }),
    ),
    prisma.vendorOrder.updateMany({ where: { orderId }, data: { status: 'CANCELLED' } }),
    prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } }),
  ]);
  if (stripe && order.paymentIntentId) {
    await stripe.refunds.create({ payment_intent: order.paymentIntentId }).catch((e) => console.error('[refund]', e.message));
  }
  await Promise.all(items.map((i) => indexProduct(i.productId)));
}
