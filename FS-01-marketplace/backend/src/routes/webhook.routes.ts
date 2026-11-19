import express, { Router } from 'express';
import Stripe from 'stripe';
import { stripe } from '../lib/stripe';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { markOrderPaid, cancelOrder } from '../services/order.service';

/**
 * Stripe webhook. Must receive the RAW body to verify the signature,
 * so it is mounted before express.json() in app.ts.
 * Local testing: stripe listen --forward-to localhost:4000/api/webhooks/stripe
 */
const router = Router();

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(400).send('Stripe not configured');
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'] as string, config.stripe.webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook signature error: ${(err as Error).message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (orderId && session.payment_status === 'paid') {
        await markOrderPaid(orderId, session.payment_intent as string);
      }
    }
    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      const order = session.metadata?.orderId
        ? await prisma.order.findUnique({ where: { id: session.metadata.orderId } })
        : null;
      if (order?.status === 'PENDING_PAYMENT') await cancelOrder(order.id); // release reserved stock
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[webhook]', err);
    res.status(500).send('Webhook handler failed');
  }
});

export default router;
