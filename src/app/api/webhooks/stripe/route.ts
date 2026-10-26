import { respond, safeRoute } from "@/lib/server/http";
import { handleStripeWebhook } from "@/modules/accounts/server/service";

export const dynamic = "force-dynamic";

/**
 * Verifies the Stripe-Signature over the raw body, then applies the event
 * idempotently. A failed write answers 500 so Stripe retries the delivery.
 */
export async function POST(request: Request): Promise<Response> {
  return safeRoute(async () => respond(await handleStripeWebhook(request)));
}
