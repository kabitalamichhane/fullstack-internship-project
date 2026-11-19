import Stripe from 'stripe';
import { config, paymentsMocked } from '../config';

export const stripe: Stripe | null = paymentsMocked ? null : new Stripe(config.stripe.secretKey);
