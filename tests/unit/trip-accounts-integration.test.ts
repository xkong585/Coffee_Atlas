import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import Stripe from "stripe";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  catalogSnapshotSchema,
  FREE_RECOMMENDATION_LIMIT,
  PAID_CAPABILITY,
  type Preferences,
  tripRequestSchema,
  tripResponseSchema,
} from "@/contracts";
import type { StructuredRequest } from "@/lib/server/ai-client";
import { createAccounts } from "@/modules/accounts/server/accounts";
import { databaseOpener } from "@/modules/accounts/server/db";
import { type PaymentGateway, stripeGateway } from "@/modules/accounts/server/stripe";
import { CATALOG_RECORDS } from "@/modules/catalog/data/records";
import { catalogService } from "@/modules/catalog/server/service";
import type { TripModelOutput } from "@/modules/trip-map/lib/model-output";
import { createTripService } from "@/modules/trip-map/server/service";

const directory = mkdtempSync(join(tmpdir(), "coffee-atlas-trip-accounts-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const WEBHOOK_SECRET = "whsec_trip_integration_test";
const CHECKOUT_ID = "cs_test_tripintegration";
const snapshot = catalogSnapshotSchema.parse(CATALOG_RECORDS);
const firstBean = snapshot.beans[0];
const secondBean = snapshot.beans.find((bean) => bean.origin.countryId !== firstBean.origin.countryId);
if (!secondBean) throw new Error("The real catalog must cover beans in two countries.");

const modelOutput: TripModelOutput = {
  outcome: "itinerary",
  title: "Your saved coffee trip",
  summary: "Try your saved bean, then discover another origin.",
  stops: [firstBean, secondBean].map((bean) => ({
    countryId: bean.origin.countryId,
    regionId: null,
    itemType: "bean",
    itemId: bean.id,
    reasons: ["Explore this catalog origin as part of your coffee trip."],
  })),
  noTripReason: "",
  suggestions: [],
};

const preferences: Preferences = {
  acidity: "low",
  sweetness: "any",
  roast: "medium",
  milk: "none",
  flavors: ["chocolate"],
  preparationMethods: ["filter"],
  notes: "Plan around the coffee I saved on my account.",
};

function request(path: string, cookie?: string): Request {
  return new Request(`https://atlas.test${path}`, {
    method: "POST",
    headers: { host: "atlas.test", origin: "https://atlas.test", ...(cookie ? { cookie } : {}) },
  });
}

function webhookRequest(event: object, secret = WEBHOOK_SECRET): Request {
  const body = JSON.stringify(event);
  const signer = new Stripe("sk_test_trip_integration");
  const signature = signer.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request("https://atlas.test/api/webhooks/stripe", {
    method: "POST", headers: { "stripe-signature": signature }, body,
  });
}

describe("trip map with real accounts and Stripe verification", () => {
  it("shares the verified paid entitlement, uses persisted planning context, and keeps users and quota isolated", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_trip_integration");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("STRIPE_PRICE_ID", "price_trip_integration");
    const db = createClient({ url: `file:${join(directory, "accounts.db")}` });
    try {
      const stripe = stripeGateway();
      if (!stripe) throw new Error("Expected the test-mode Stripe gateway.");
      // Session creation stays offline; webhook signatures use the real gateway.
      const payments: PaymentGateway = {
        createCheckoutSession: async () => ({ id: CHECKOUT_ID, url: `https://checkout.stripe.com/c/pay/${CHECKOUT_ID}` }),
        getPrice: async () => ({ unitAmount: 499, currency: "usd" }),
        verifyEvent: stripe.verifyEvent,
      };
      const accounts = createAccounts({
        database: databaseOpener(() => db),
        secret: () => "trip-integration-session-secret-at-least-32-characters",
        catalog: catalogService,
        payments: () => payments,
        appUrl: () => "https://atlas.test",
        now: () => new Date(),
      });
      const register = async (email: string) => {
        const auth = await accounts.auth.signUp(request("/api/auth/signup"), {
          email, password: "a correct test password", displayName: null,
        });
        if (!auth.result.ok || auth.result.data.status !== "signed-in" || !auth.cookie) {
          throw new Error("Registration must establish a real session.");
        }
        return { cookie: auth.cookie.split(";")[0], userId: auth.result.data.user.id };
      };
      const payer = await register("traveler@example.com");
      const other = await register("another-traveler@example.com");
      const payerRequest = request("/api/trip", payer.cookie);
      const otherRequest = request("/api/trip", other.cookie);
      expect(await accounts.service.savePreferences(payerRequest, preferences)).toEqual({ ok: true, data: preferences });
      expect(await accounts.service.saveItem(payerRequest, { itemType: "bean", itemId: firstBean.id })).toMatchObject({ ok: true });

      // The trip receives no client preferences or saved references.
      const input = tripRequestSchema.parse({ stopCount: 2, useSavedItems: true });
      const readContext = vi.spyOn(accounts.service, "getPlanningContext");
      const recordUse = vi.spyOn(accounts.service, "recordRecommendationUse");
      const modelCalls = vi.fn<(input: StructuredRequest<unknown>) => void>();
      const trip = createTripService({
        loadCatalog: async () => ({ status: "ready", snapshot, preview: false }),
        generate: async (input) => {
          modelCalls(input);
          return { ok: true, data: input.schema.parse(modelOutput) };
        },
        accounts: accounts.service,
        requiresAccess: () => true,
      });

      expect(await trip.plan(payerRequest, input)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(modelCalls).not.toHaveBeenCalled();
      expect(readContext).not.toHaveBeenCalled();
      const checkout = await accounts.service.createCheckout(payerRequest, { capability: PAID_CAPABILITY });
      expect(checkout).toMatchObject({ ok: true });
      const forgedRedirect = request(`/api/trip?session_id=${CHECKOUT_ID}&paid=true`, payer.cookie);
      expect(await trip.plan(forgedRedirect, input)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      const event = {
        id: "evt_trip_integration_paid", object: "event", type: "checkout.session.completed", livemode: false,
        data: { object: {
          id: CHECKOUT_ID, object: "checkout.session", payment_status: "paid", client_reference_id: payer.userId,
          metadata: { userId: payer.userId, capability: PAID_CAPABILITY },
        } },
      };
      expect(await accounts.handleStripeWebhook(webhookRequest(event, "whsec_forged")))
        .toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(await trip.plan(payerRequest, input)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(modelCalls).not.toHaveBeenCalled();

      // Using the free recommendation allowance does not provide trip access.
      for (let used = 0; used < FREE_RECOMMENDATION_LIMIT; used += 1) {
        expect(await accounts.service.recordRecommendationUse(payerRequest)).toMatchObject({ ok: true });
      }
      expect(await accounts.service.getRecommendationAllowance(payerRequest))
        .toMatchObject({ ok: true, data: { paid: false, freeRemaining: 0 } });
      expect(await trip.plan(payerRequest, input)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      recordUse.mockClear();

      expect(await accounts.handleStripeWebhook(webhookRequest(event)))
        .toMatchObject({ ok: true, data: { outcome: "granted" } });
      expect(await accounts.service.getAccess(payerRequest))
        .toEqual({ capability: PAID_CAPABILITY, status: "granted", allowed: true });
      const result = await trip.plan(payerRequest, input);
      expect(result).toMatchObject({ ok: true, data: { status: "itinerary", itinerary: {
        basis: { preferences: "account", savedItems: 1 },
        stops: [
          { recommendation: { itemType: "bean", itemId: firstBean.id }, fromSaved: true, sourceIds: firstBean.sourceIds },
          { recommendation: { itemType: "bean", itemId: secondBean.id }, fromSaved: false, sourceIds: secondBean.sourceIds },
        ],
      } } });
      expect(result.ok && tripResponseSchema.safeParse(result.data).success).toBe(true);
      expect(readContext).toHaveBeenCalledWith(payerRequest);
      expect(modelCalls).toHaveBeenCalledTimes(1);
      expect(modelCalls.mock.calls[0][0].prompt).toContain(preferences.notes);
      expect(modelCalls.mock.calls[0][0].prompt).toContain(`${firstBean.name} (bean:${firstBean.id})`);
      expect(recordUse).not.toHaveBeenCalled();
      expect(await accounts.service.getRecommendationAllowance(payerRequest))
        .toMatchObject({ ok: true, data: { paid: true, freeUsed: FREE_RECOMMENDATION_LIMIT, freeRemaining: 0 } });
      expect((await db.execute("SELECT used FROM recommendation_usage WHERE user_id = ?", [payer.userId])).rows[0].used)
        .toBe(FREE_RECOMMENDATION_LIMIT);

      expect(await accounts.service.getPlanningContext(otherRequest)).toEqual({ ok: true, data: { preferences: null, saved: [] } });
      expect(await accounts.service.getAccess(otherRequest))
        .toEqual({ capability: PAID_CAPABILITY, status: "denied", allowed: false });
      expect(await trip.plan(otherRequest, input)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(modelCalls).toHaveBeenCalledTimes(1);
    } finally {
      db.close();
      vi.unstubAllEnvs();
    }
  });
});
