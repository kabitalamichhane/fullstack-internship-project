import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';
import {
  clearCart,
  getCartQuantity,
  getCartView,
  removeCartItems,
  setCartQuantity,
} from '../services/cart.service';
import { prisma } from '../lib/prisma';

/**
 * The cart lives in Redis as a hash: cart:{userId} → { productId: quantity }.
 * It is fast, survives page reloads and expires after 30 days of inactivity.
 */
const router = Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await getCartView(req.user!.id));
  }),
);

const itemSchema = z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(99) });

router.post(
  '/items',
  asyncHandler(async (req, res) => {
    const { productId, quantity } = itemSchema.parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) throw new HttpError(404, 'Product not available');
    const current = await getCartQuantity(req.user!.id, productId);
    const next = current + quantity;
    if (next > product.stock) throw new HttpError(400, `Only ${product.stock} left in stock`);
    await setCartQuantity(req.user!.id, productId, next);
    res.json(await getCartView(req.user!.id));
  }),
);

router.put(
  '/items/:productId',
  asyncHandler(async (req, res) => {
    const { quantity } = z.object({ quantity: z.coerce.number().int().min(0).max(99) }).parse(req.body);
    if (quantity === 0) {
      await setCartQuantity(req.user!.id, req.params.productId, 0);
    } else {
      const product = await prisma.product.findUnique({ where: { id: req.params.productId } });
      if (!product) throw new HttpError(404, 'Product not found');
      if (quantity > product.stock) throw new HttpError(400, `Only ${product.stock} left in stock`);
      await setCartQuantity(req.user!.id, req.params.productId, quantity);
    }
    res.json(await getCartView(req.user!.id));
  }),
);

router.delete(
  '/items/:productId',
  asyncHandler(async (req, res) => {
    await removeCartItems(req.user!.id, req.params.productId);
    res.json(await getCartView(req.user!.id));
  }),
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    await clearCart(req.user!.id);
    res.json(await getCartView(req.user!.id));
  }),
);

export default router;
