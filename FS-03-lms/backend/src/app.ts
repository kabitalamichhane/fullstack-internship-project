import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config, paymentsMocked } from './config';
import { errorHandler } from './middleware/error';
import authRoutes from './routes/auth.routes';
import courseRoutes from './routes/course.routes';
import lessonRoutes from './routes/lesson.routes';
import quizRoutes from './routes/quiz.routes';
import liveRoutes from './routes/live.routes';
import certificateRoutes from './routes/certificate.routes';
import enrollRoutes, { stripeWebhook } from './routes/enroll.routes';
import instructorRoutes from './routes/instructor.routes';
import adminRoutes from './routes/admin.routes';

export function createApp() {
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.clientUrl.split(','), credentials: true }));
  if (config.env !== 'test') app.use(morgan('dev'));

  // Raw body for Stripe signature verification — must come before express.json()
  app.use('/api/enroll/webhook', stripeWebhook);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', paymentsMode: paymentsMocked ? 'mock' : 'stripe-test' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/courses', courseRoutes);
  app.use('/api/lessons', lessonRoutes);
  app.use('/api/quizzes', quizRoutes);
  app.use('/api/live', liveRoutes);
  app.use('/api/certificates', certificateRoutes);
  app.use('/api/enroll', enrollRoutes);
  app.use('/api/instructor', instructorRoutes);
  app.use('/api/admin', adminRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use(errorHandler);
  return app;
}
