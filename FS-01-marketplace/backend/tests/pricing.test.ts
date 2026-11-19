import { describe, expect, it } from 'vitest';
import { aggregateStatus, canTransition, computeDiscount, splitOrder, CouponLike } from '../src/utils/pricing';

const base: CouponLike = { type: 'PERCENT', value: 10, minOrderCents: 0, maxUses: null, usedCount: 0, expiresAt: null, active: true };

describe('computeDiscount', () => {
  it('applies a percent coupon', () => {
    expect(computeDiscount(base, 10000)).toEqual({ ok: true, discountCents: 1000 });
  });
  it('applies a fixed coupon but never more than the subtotal', () => {
    expect(computeDiscount({ ...base, type: 'FIXED', value: 500 }, 2000)).toEqual({ ok: true, discountCents: 500 });
    expect(computeDiscount({ ...base, type: 'FIXED', value: 5000 }, 2000)).toEqual({ ok: true, discountCents: 2000 });
  });
  it('rejects expired, inactive, used-up and below-minimum coupons', () => {
    expect(computeDiscount({ ...base, expiresAt: new Date('2020-01-01') }, 1000).ok).toBe(false);
    expect(computeDiscount({ ...base, active: false }, 1000).ok).toBe(false);
    expect(computeDiscount({ ...base, maxUses: 5, usedCount: 5 }, 1000).ok).toBe(false);
    expect(computeDiscount({ ...base, minOrderCents: 5000 }, 1000).ok).toBe(false);
  });
});

describe('splitOrder (multi-vendor payment split)', () => {
  it('takes commission from each vendor', () => {
    const [a, b] = splitOrder(
      [
        { vendorId: 'a', subtotalCents: 10000 },
        { vendorId: 'b', subtotalCents: 5000 },
      ],
      0,
      10,
    );
    expect(a).toMatchObject({ commissionCents: 1000, vendorPayoutCents: 9000 });
    expect(b).toMatchObject({ commissionCents: 500, vendorPayoutCents: 4500 });
  });

  it('shares the discount proportionally and the money always adds up', () => {
    const groups = [
      { vendorId: 'a', subtotalCents: 3333 },
      { vendorId: 'b', subtotalCents: 3333 },
      { vendorId: 'c', subtotalCents: 3334 },
    ];
    const result = splitOrder(groups, 1001, 12.5);
    const totalDiscount = result.reduce((s, r) => s + r.discountCents, 0);
    expect(totalDiscount).toBe(1001);
    for (const r of result) {
      expect(r.commissionCents + r.vendorPayoutCents + r.discountCents).toBe(r.subtotalCents);
    }
  });
});

describe('order lifecycle', () => {
  it('only allows forward transitions', () => {
    expect(canTransition('PLACED', 'PACKED')).toBe(true);
    expect(canTransition('PACKED', 'SHIPPED')).toBe(true);
    expect(canTransition('SHIPPED', 'DELIVERED')).toBe(true);
    expect(canTransition('PLACED', 'DELIVERED')).toBe(false);
    expect(canTransition('DELIVERED', 'PLACED')).toBe(false);
    expect(canTransition('SHIPPED', 'CANCELLED')).toBe(false);
  });
  it('derives overall status from the slowest vendor', () => {
    expect(aggregateStatus(['SHIPPED', 'PACKED'])).toBe('PACKED');
    expect(aggregateStatus(['DELIVERED', 'DELIVERED'])).toBe('DELIVERED');
    expect(aggregateStatus(['CANCELLED', 'SHIPPED'])).toBe('SHIPPED');
    expect(aggregateStatus(['CANCELLED'])).toBe('CANCELLED');
  });
});
