import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  clearCart,
  getCartQuantities,
  getCartQuantity,
  removeCartItems,
  setCartQuantity,
} from '../src/services/cart.service';

describe('in-memory cart fallback', () => {
  it('adds, reads, removes, and clears cart quantities without Redis', async () => {
    const userId = `local-${randomUUID()}`;
    await setCartQuantity(userId, 'product-1', 2);

    expect(await getCartQuantity(userId, 'product-1')).toBe(2);
    expect(await getCartQuantities(userId)).toEqual({ 'product-1': '2' });

    await setCartQuantity(userId, 'product-1', 0);
    expect(await getCartQuantities(userId)).toEqual({});

    await setCartQuantity(userId, 'product-1', 1);
    await removeCartItems(userId, 'product-1');
    expect(await getCartQuantities(userId)).toEqual({});

    await setCartQuantity(userId, 'product-1', 3);
    await clearCart(userId);
    expect(await getCartQuantities(userId)).toEqual({});
  });
});
