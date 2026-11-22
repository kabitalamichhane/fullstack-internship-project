import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { config } from '../config';

export const cartKey = (userId: string) => `cart:${userId}`;
const CART_TTL_MS = 60 * 60 * 24 * 30 * 1000;

const memoryCarts = new Map<string, { items: Map<string, number>; expiresAt: number }>();

function useMemoryCarts() {
  return (config.env === 'development' || config.env === 'test') && redis.status !== 'ready';
}

function getMemoryCart(userId: string, create = false) {
  let cart = memoryCarts.get(userId);
  if (cart && cart.expiresAt <= Date.now()) {
    memoryCarts.delete(userId);
    cart = undefined;
  }
  if (!cart && create) {
    cart = { items: new Map(), expiresAt: Date.now() + CART_TTL_MS };
    memoryCarts.set(userId, cart);
  }
  return cart;
}

export async function getCartQuantities(userId: string) {
  if (useMemoryCarts()) {
    const items = getMemoryCart(userId)?.items;
    return Object.fromEntries(
      items ? Array.from(items, ([productId, quantity]) => [productId, String(quantity)]) : [],
    );
  }
  return redis.hgetall(cartKey(userId));
}

export async function getCartQuantity(userId: string, productId: string) {
  if (useMemoryCarts()) return getMemoryCart(userId)?.items.get(productId) ?? 0;
  return Number((await redis.hget(cartKey(userId), productId)) ?? 0);
}

export async function setCartQuantity(userId: string, productId: string, quantity: number) {
  if (useMemoryCarts()) {
    const cart = getMemoryCart(userId, quantity > 0);
    if (!cart) return;
    if (quantity === 0) {
      cart.items.delete(productId);
    } else {
      cart.items.set(productId, quantity);
      cart.expiresAt = Date.now() + CART_TTL_MS;
    }
    if (cart.items.size === 0) memoryCarts.delete(userId);
    return;
  }
  const key = cartKey(userId);
  if (quantity === 0) {
    await redis.hdel(key, productId);
  } else {
    await redis.hset(key, productId, quantity);
    await redis.expire(key, CART_TTL_MS / 1000);
  }
}

export async function removeCartItems(userId: string, ...productIds: string[]) {
  if (!productIds.length) return;
  if (useMemoryCarts()) {
    const cart = getMemoryCart(userId);
    if (!cart) return;
    for (const productId of productIds) cart.items.delete(productId);
    if (cart.items.size === 0) memoryCarts.delete(userId);
    return;
  }
  await redis.hdel(cartKey(userId), ...productIds);
}

export async function clearCart(userId: string) {
  if (useMemoryCarts()) {
    memoryCarts.delete(userId);
    return;
  }
  await redis.del(cartKey(userId));
}

export type CartLine = {
  productId: string;
  title: string;
  image: string | null;
  unitPriceCents: number;
  quantity: number;
  stock: number;
  vendorId: string;
  storeName: string;
  lineTotalCents: number;
};

/** Read the cart and join it with fresh product data from Postgres (prices may have changed). */
export async function getCartView(userId: string) {
  const raw = await getCartQuantities(userId);
  const ids = Object.keys(raw);
  if (ids.length === 0) return { items: [] as CartLine[], subtotalCents: 0, itemCount: 0 };

  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isActive: true },
    include: { vendor: { select: { storeName: true } } },
  });

  const items: CartLine[] = products.map((p) => {
    const quantity = Number(raw[p.id]);
    return {
      productId: p.id,
      title: p.title,
      image: p.images[0] ?? null,
      unitPriceCents: p.priceCents,
      quantity,
      stock: p.stock,
      vendorId: p.vendorId,
      storeName: p.vendor.storeName,
      lineTotalCents: p.priceCents * quantity,
    };
  });

  // Remove products that were deleted or deactivated since they were added.
  const stale = ids.filter((id) => !products.some((p) => p.id === id));
  if (stale.length) await removeCartItems(userId, ...stale);

  return {
    items,
    subtotalCents: items.reduce((s, i) => s + i.lineTotalCents, 0),
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
  };
}
