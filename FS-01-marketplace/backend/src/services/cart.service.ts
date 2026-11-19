import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';

export const cartKey = (userId: string) => `cart:${userId}`;

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

/** Read the Redis cart and join it with fresh product data from Postgres (prices may have changed). */
export async function getCartView(userId: string) {
  const raw = await redis.hgetall(cartKey(userId));
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
  if (stale.length) await redis.hdel(cartKey(userId), ...stale);

  return {
    items,
    subtotalCents: items.reduce((s, i) => s + i.lineTotalCents, 0),
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
  };
}
