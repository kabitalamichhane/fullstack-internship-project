/**
 * Seed demo data. Run: npm run seed
 * Tries to pull products from the free DummyJSON API (https://dummyjson.com/products);
 * if offline, it falls back to a small built-in list.
 *
 * Demo logins (password for all: Password123!)
 *   admin@demo.com     ADMIN
 *   vendor1@demo.com   VENDOR (TechHub)
 *   vendor2@demo.com   VENDOR (StyleCorner)
 *   customer@demo.com  CUSTOMER
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

type SeedProduct = { title: string; description: string; price: number; stock: number; category: string; thumbnail?: string; images?: string[]; rating?: number };

const FALLBACK: SeedProduct[] = [
  { title: 'Wireless Earbuds Pro', description: 'Noise-cancelling true wireless earbuds with 24h battery.', price: 59.99, stock: 40, category: 'electronics' },
  { title: 'Mechanical Keyboard', description: 'RGB mechanical keyboard with hot-swappable switches.', price: 89.0, stock: 25, category: 'electronics' },
  { title: '4K Action Camera', description: 'Waterproof action camera with image stabilization.', price: 149.5, stock: 15, category: 'electronics' },
  { title: 'Cotton Crew T-Shirt', description: 'Soft 100% organic cotton t-shirt, regular fit.', price: 14.99, stock: 120, category: 'fashion' },
  { title: 'Leather Wallet', description: 'Slim genuine leather wallet with RFID blocking.', price: 24.0, stock: 60, category: 'fashion' },
  { title: 'Running Shoes', description: 'Lightweight running shoes with breathable mesh.', price: 69.99, stock: 35, category: 'fashion' },
  { title: 'Ceramic Coffee Mug', description: 'Hand-glazed 350ml ceramic mug, dishwasher safe.', price: 9.5, stock: 200, category: 'home' },
  { title: 'Scented Candle Set', description: 'Set of 3 soy wax candles: vanilla, lavender, cedar.', price: 19.99, stock: 80, category: 'home' },
];

async function loadProducts(): Promise<SeedProduct[]> {
  try {
    const res = await fetch('https://dummyjson.com/products?limit=60');
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { products: SeedProduct[] };
    return data.products;
  } catch {
    console.log('DummyJSON unreachable, using built-in fallback products');
    return FALLBACK;
  }
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const mkUser = (email: string, name: string, role: Role) =>
    prisma.user.upsert({ where: { email }, update: {}, create: { email, name, role, passwordHash } });

  await mkUser('admin@demo.com', 'Admin', 'ADMIN');
  await mkUser('customer@demo.com', 'Demo Customer', 'CUSTOMER');
  const v1 = await mkUser('vendor1@demo.com', 'Tech Vendor', 'VENDOR');
  const v2 = await mkUser('vendor2@demo.com', 'Style Vendor', 'VENDOR');

  const vendor1 = await prisma.vendor.upsert({ where: { userId: v1.id }, update: {}, create: { userId: v1.id, storeName: 'TechHub', approved: true, description: 'Gadgets and electronics' } });
  const vendor2 = await prisma.vendor.upsert({ where: { userId: v2.id }, update: {}, create: { userId: v2.id, storeName: 'StyleCorner', approved: true, description: 'Fashion, beauty and home' } });

  const products = await loadProducts();
  let i = 0;
  for (const p of products) {
    const slug = slugify(p.category);
    const category = await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { slug, name: p.category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) },
    });
    const exists = await prisma.product.findFirst({ where: { title: p.title } });
    if (exists) continue;
    await prisma.product.create({
      data: {
        title: p.title,
        description: p.description,
        priceCents: Math.round(p.price * 100),
        stock: p.stock,
        images: p.images?.length ? p.images.slice(0, 4) : p.thumbnail ? [p.thumbnail] : [],
        categoryId: category.id,
        vendorId: i++ % 2 === 0 ? vendor1.id : vendor2.id,
      },
    });
  }

  await prisma.coupon.upsert({ where: { code: 'WELCOME10' }, update: {}, create: { code: 'WELCOME10', type: 'PERCENT', value: 10 } });
  await prisma.coupon.upsert({ where: { code: 'FLAT5' }, update: {}, create: { code: 'FLAT5', type: 'FIXED', value: 500, minOrderCents: 2500 } });

  console.log(`Seed complete: ${await prisma.product.count()} products. Now run "npm run reindex" to fill Elasticsearch.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
