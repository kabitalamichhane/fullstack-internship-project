import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config, paymentsMocked } from './config';
import { errorHandler } from './middleware/error';
import authRoutes from './routes/auth.routes';
import vendorRoutes from './routes/vendor.routes';
import productRoutes from './routes/product.routes';
import searchRoutes from './routes/search.routes';
import cartRoutes from './routes/cart.routes';
import orderRoutes from './routes/order.routes';
import reviewRoutes from './routes/review.routes';
import couponRoutes from './routes/coupon.routes';
import adminRoutes from './routes/admin.routes';
import webhookRoutes from './routes/webhook.routes';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.clientUrl.split(','), credentials: true }));
  if (config.env !== 'test') app.use(morgan('dev'));

  // Stripe webhooks need the raw body, so they are registered BEFORE express.json().
  app.use('/api/webhooks', webhookRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', paymentsMode: paymentsMocked ? 'mock' : 'stripe-test' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/vendor', vendorRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/coupons', couponRoutes);
  app.use('/api/admin', adminRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use(errorHandler);
  return app;
}
