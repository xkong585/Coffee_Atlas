import "server-only";
import Stripe from "stripe";
import { PAID_CAPABILITY } from "@/contracts";

/** The Stripe operations the app needs, so tests can run without the network. */
export interface PaymentGateway {
  createCheckoutSession(input: {
    userId: string;
    email: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ id: string; url: string }>;
  /** The configured one-time price, or null if it has no fixed amount. */
  getPrice(): Promise<{ unitAmount: number; currency: string } | null>;
  /** Throws unless the raw body carries a valid Stripe-Signature for the webhook secret. */
  verifyEvent(rawBody: string, signature: string): Promise<Stripe.Event>;
}

let cached: { key: string; gateway: PaymentGateway } | null = null;
const PRICE_TTL_MS = 10 * 60_000;

/**
 * Null until STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PRICE_ID are
 * all set. Only test-mode keys are accepted: this project must never take a
 * real payment.
 */
export function stripeGateway(): PaymentGateway | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const price = process.env.STRIPE_PRICE_ID?.trim();
  if (!secretKey || !webhookSecret || !price) return null;
  if (!/^(sk|rk)_test_/.test(secretKey)) {
    console.error("STRIPE_SECRET_KEY is not a test-mode key; checkout stays disabled.");
    return null;
  }
  const key = `${secretKey}|${webhookSecret}|${price}`;
  if (cached?.key === key) return cached.gateway;

  const stripe = new Stripe(secretKey, { maxNetworkRetries: 1, timeout: 20_000 });
  let priceCache: { at: number; value: Promise<{ unitAmount: number; currency: string } | null> } | null = null;
  const gateway: PaymentGateway = {
    async createCheckoutSession({ userId, email, successUrl, cancelUrl }) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price, quantity: 1 }],
        client_reference_id: userId,
        customer_email: email ?? undefined,
        metadata: { userId, capability: PAID_CAPABILITY },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      if (!session.url) throw new Error("Stripe returned a checkout session without a URL.");
      return { id: session.id, url: session.url };
    },
    getPrice() {
      if (!priceCache || Date.now() - priceCache.at > PRICE_TTL_MS) {
        const value = stripe.prices.retrieve(price).then((found) =>
          found.unit_amount === null ? null : { unitAmount: found.unit_amount, currency: found.currency });
        // A failed lookup is not cached, so the next page view tries again.
        value.catch(() => { priceCache = null; });
        priceCache = { at: Date.now(), value };
      }
      return priceCache.value;
    },
    verifyEvent: (rawBody, signature) => stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret),
  };
  cached = { key, gateway };
  return gateway;
}
