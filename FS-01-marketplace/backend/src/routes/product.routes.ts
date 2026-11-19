import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';
import { uploadImage, deleteImageByUrl } from '../lib/s3';
import { indexProduct, removeProduct } from '../lib/elastic';
import { cached, invalidate } from '../lib/redis';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
});

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await cached('categories', 300, () => prisma.category.findMany({ orderBy: { name: 'asc' } }));
    res.json({ categories });
  }),
);

/** Public product detail, cached in Redis for 60 seconds. */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await cached(`product:${req.params.id}`, 60, () =>
      prisma.product.findUnique({
        where: { id: req.params.id },
        include: {
          category: true,
          vendor: { select: { id: true, storeName: true, logoUrl: true, approved: true } },
          reviews: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 20 },
        },
      }),
    );
    if (!product) throw new HttpError(404, 'Product not found');
    res.json({ product });
  }),
);

// multipart/form-data sends everything as strings, so coerce numbers.
const productSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  priceCents: z.coerce.number().int().positive(),
  stock: z.coerce.number().int().min(0),
  categoryId: z.string().min(1),
  isActive: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
});

async function vendorFor(userId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { userId } });
  if (!vendor) throw new HttpError(403, 'Vendor profile required');
  return vendor;
}

router.post(
  '/',
  authenticate,
  requireRole('VENDOR'),
  upload.array('images', 6),
  asyncHandler(async (req, res) => {
    const vendor = await vendorFor(req.user!.id);
    const data = productSchema.parse(req.body);
    const files = (req.files as Express.Multer.File[]) ?? [];
    const images = await Promise.all(files.map((f) => uploadImage(f, `products/${vendor.id}`)));
    const product = await prisma.product.create({ data: { ...data, vendorId: vendor.id, images } });
    await indexProduct(product.id);
    res.status(201).json({ product });
  }),
);

router.put(
  '/:id',
  authenticate,
  requireRole('VENDOR'),
  upload.array('images', 6),
  asyncHandler(async (req, res) => {
    const vendor = await vendorFor(req.user!.id);
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, vendorId: vendor.id } });
    if (!existing) throw new HttpError(404, 'Product not found');

    const data = productSchema.partial().parse(req.body);
    // removeImages: JSON array of image URLs the vendor deleted in the UI
    const removeImages: string[] = req.body.removeImages ? JSON.parse(req.body.removeImages) : [];
    const files = (req.files as Express.Multer.File[]) ?? [];
    const added = await Promise.all(files.map((f) => uploadImage(f, `products/${vendor.id}`)));
    const images = [...existing.images.filter((u) => !removeImages.includes(u)), ...added];
    await Promise.all(removeImages.map(deleteImageByUrl));

    const product = await prisma.product.update({ where: { id: existing.id }, data: { ...data, images } });
    await invalidate(`product:${product.id}`);
    await indexProduct(product.id);
    res.json({ product });
  }),
);

router.delete(
  '/:id',
  authenticate,
  requireRole('VENDOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const where = req.user!.role === 'ADMIN' ? { id: req.params.id } : { id: req.params.id, vendor: { userId: req.user!.id } };
    const product = await prisma.product.findFirst({ where });
    if (!product) throw new HttpError(404, 'Product not found');
    const ordered = await prisma.orderItem.count({ where: { productId: product.id } });
    if (ordered > 0) {
      // Keep order history intact: soft-delete products that were already sold.
      await prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
      await indexProduct(product.id);
    } else {
      await prisma.product.delete({ where: { id: product.id } });
      await Promise.all(product.images.map(deleteImageByUrl));
      await removeProduct(product.id);
    }
    await invalidate(`product:${product.id}`);
    res.json({ ok: true });
  }),
);

export default router;
