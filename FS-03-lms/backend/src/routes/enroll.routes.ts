import express, { Router } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { stripe } from '../lib/stripe';
import { config, paymentsMocked } from '../config';
import { authenticate } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';
import { revenueSplit } from '../utils/learning';

const router = Router();

/** Mark a payment as paid and enroll the student. Safe to call twice (webhooks retry). */
export async function completePayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status === 'PAID') return;
  await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { status: 'PAID', paidAt: new Date() } }),
    prisma.enrollment.upsert({
      where: { userId_courseId: { userId: payment.userId, courseId: payment.courseId } },
      create: { userId: payment.userId, courseId: payment.courseId },
      update: {},
    }),
  ]);
}

/**
 * Enroll in a course.
 *  - Free course → enrolled immediately.
 *  - Paid course → Stripe Checkout (test mode) URL; enrollment happens in the webhook.
 *  - Mock mode (no Stripe key) → payment recorded as paid immediately.
 */
router.post(
  '/:courseId',
  authenticate,
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findUnique({ where: { id: req.params.courseId } });
    if (!course || !course.published) throw new HttpError(404, 'Course not found');
    if (course.instructorId === req.user!.id) throw new HttpError(400, 'You are the instructor of this course');
    const existing = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: req.user!.id, courseId: course.id } } });
    if (existing) return res.json({ enrolled: true });

    if (course.priceCents === 0) {
      await prisma.enrollment.create({ data: { userId: req.user!.id, courseId: course.id } });
      return res.status(201).json({ enrolled: true });
    }

    const split = revenueSplit(course.priceCents, config.platformFeePercent);
    const payment = await prisma.payment.create({
      data: { userId: req.user!.id, courseId: course.id, amountCents: course.priceCents, ...split },
    });

    if (paymentsMocked || !stripe) {
      await completePayment(payment.id);
      return res.status(201).json({ enrolled: true, mocked: true });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: req.user!.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: config.currency,
            unit_amount: course.priceCents,
            product_data: { name: course.title, images: course.thumbnailUrl ? [course.thumbnailUrl] : undefined },
          },
        },
      ],
      metadata: { paymentId: payment.id },
      success_url: `${config.clientUrl}/courses/${course.id}?enrolled=1`,
      cancel_url: `${config.clientUrl}/courses/${course.id}`,
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { stripeSessionId: session.id } });
    res.status(201).json({ enrolled: false, checkoutUrl: session.url });
  }),
);

/** Stripe webhook (raw body). Local: stripe listen --forward-to localhost:5000/api/enroll/webhook */
export const stripeWebhook = Router().post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(400).send('Stripe not configured');
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'] as string, config.stripe.webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook signature error: ${(err as Error).message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.paymentId && session.payment_status === 'paid') {
      await completePayment(session.metadata.paymentId).catch((e) => console.error('[webhook]', e));
    }
  }
  res.json({ received: true });
});

export default router;
