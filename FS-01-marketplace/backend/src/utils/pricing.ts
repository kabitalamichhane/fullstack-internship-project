/**
 * Pure pricing logic (no database) so it can be unit-tested easily.
 * All amounts are integers in cents.
 */

export type CouponLike = {
  type: 'PERCENT' | 'FIXED';
  value: number;
  minOrderCents: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  active: boolean;
};

export type CouponCheck = { ok: true; discountCents: number } | { ok: false; reason: string };

export function computeDiscount(coupon: CouponLike, subtotalCents: number, now = new Date()): CouponCheck {
  if (!coupon.active) return { ok: false, reason: 'Coupon is not active' };
  if (coupon.expiresAt && coupon.expiresAt < now) return { ok: false, reason: 'Coupon has expired' };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses)
    return { ok: false, reason: 'Coupon usage limit reached' };
  if (subtotalCents < coupon.minOrderCents)
    return { ok: false, reason: `Minimum order is ${(coupon.minOrderCents / 100).toFixed(2)}` };

  const raw =
    coupon.type === 'PERCENT' ? Math.round((subtotalCents * Math.min(coupon.value, 100)) / 100) : coupon.value;
  return { ok: true, discountCents: Math.min(raw, subtotalCents) };
}

export type VendorSplitInput = { vendorId: string; subtotalCents: number };
export type VendorSplit = VendorSplitInput & {
  discountCents: number;
  commissionCents: number;
  vendorPayoutCents: number;
};

/**
 * Split an order between vendors.
 * - The coupon discount is shared proportionally to each vendor's subtotal (the last vendor absorbs rounding).
 * - The platform commission is a percentage of what the vendor actually earns after discount.
 */
export function splitOrder(
  groups: VendorSplitInput[],
  totalDiscountCents: number,
  commissionPercent: number,
): VendorSplit[] {
  const subtotal = groups.reduce((s, g) => s + g.subtotalCents, 0);
  let discountLeft = totalDiscountCents;

  return groups.map((g, i) => {
    const isLast = i === groups.length - 1;
    const discountCents = isLast
      ? discountLeft
      : subtotal === 0
        ? 0
        : Math.round((totalDiscountCents * g.subtotalCents) / subtotal);
    discountLeft -= discountCents;
    const net = g.subtotalCents - discountCents;
    const commissionCents = Math.round((net * commissionPercent) / 100);
    return { ...g, discountCents, commissionCents, vendorPayoutCents: net - commissionCents };
  });
}

/** Allowed order status transitions for the order lifecycle. */
export const STATUS_FLOW: Record<string, string[]> = {
  PENDING_PAYMENT: ['PLACED', 'CANCELLED'],
  PLACED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: string, to: string): boolean {
  return (STATUS_FLOW[from] ?? []).includes(to);
}

/** Combined status of an order derived from its vendor sub-orders (slowest vendor wins). */
export function aggregateStatus(statuses: string[]): string {
  const order = ['PENDING_PAYMENT', 'PLACED', 'PACKED', 'SHIPPED', 'DELIVERED'];
  const active = statuses.filter((s) => s !== 'CANCELLED');
  if (active.length === 0) return 'CANCELLED';
  return active.reduce((min, s) => (order.indexOf(s) < order.indexOf(min) ? s : min), 'DELIVERED');
}
