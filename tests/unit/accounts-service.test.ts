import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import Stripe from "stripe";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FREE_RECOMMENDATION_LIMIT, PAID_CAPABILITY, type Preferences } from "@/contracts";
import { CATALOG_RECORDS } from "@/modules/catalog/data/records";
import { catalogService } from "@/modules/catalog/server/service";
import { createAccounts, SESSION_COOKIE } from "@/modules/accounts/server/accounts";
import { databaseOpener } from "@/modules/accounts/server/db";
import { type PaymentGateway, stripeGateway } from "@/modules/accounts/server/stripe";

const WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests";
const SECRET = "a".repeat(40);
const BEAN = CATALOG_RECORDS.beans[0].id;
const DRINK = CATALOG_RECORDS.drinks[0].id;

const directory = mkdtempSync(join(tmpdir(), "coffee-atlas-accounts-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
let databaseCount = 0;

const signer = new Stripe("sk_test_unit");
let checkoutCount = 0;

function setup(overrides: { payments?: boolean; database?: boolean; clock?: { now: Date } } = {}) {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  vi.stubEnv("STRIPE_PRICE_ID", "price_unit");
  const real = stripeGateway();
  if (!real) throw new Error("Expected a test-mode gateway.");
  const createCheckoutSession = vi.fn<PaymentGateway["createCheckoutSession"]>(async () => {
    checkoutCount += 1;
    const id = `cs_test_unit${checkoutCount}`;
    return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
  });
  const getPrice = vi.fn<PaymentGateway["getPrice"]>(async () => ({ unitAmount: 499, currency: "usd" }));
  const gateway: PaymentGateway = { createCheckoutSession, getPrice, verifyEvent: real.verifyEvent };
  databaseCount += 1;
  const url = `file:${join(directory, `test-${databaseCount}.db`)}`;
  const accounts = createAccounts({
    database: databaseOpener(() => (overrides.database === false ? null : createClient({ url }))),
    secret: () => SECRET,
    catalog: catalogService,
    payments: () => (overrides.payments === false ? null : gateway),
    appUrl: () => "https://atlas.test",
    now: () => overrides.clock?.now ?? new Date(),
  });
  return { ...accounts, createCheckoutSession, getPrice, url };
}

function request(path: string, init: { method?: string; cookie?: string | null; origin?: string; body?: unknown } = {}): Request {
  const headers = new Headers({ host: "atlas.test" });
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.origin) headers.set("origin", init.origin);
  return new Request(`https://atlas.test${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const cookieFrom = (header: string | null) => header?.split(";")[0] ?? null;

async function signUp(accounts: ReturnType<typeof setup>, email: string) {
  const { result, cookie } = await accounts.auth.signUp(request("/api/auth/signup", { method: "POST" }), {
    email, password: "correct horse battery", displayName: "Tester",
  });
  expect(result).toMatchObject({ ok: true, data: { status: "signed-in", user: { email } } });
  return cookieFrom(cookie);
}

function webhookRequest(event: object, secret = WEBHOOK_SECRET): Request {
  const payload = JSON.stringify(event);
  const signature = signer.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("https://atlas.test/api/webhooks/stripe", {
    method: "POST", headers: { "stripe-signature": signature, "content-type": "application/json" }, body: payload,
  });
}

let eventCount = 0;
function checkoutEvent(type: string, session: { id: string; userId: string; paymentStatus?: string }, extra: { livemode?: boolean; id?: string; metadataUser?: string } = {}) {
  eventCount += 1;
  return {
    id: extra.id ?? `evt_unit_${eventCount}`,
    object: "event",
    type,
    livemode: extra.livemode ?? false,
    data: {
      object: {
        id: session.id,
        object: "checkout.session",
        client_reference_id: session.userId,
        payment_status: session.paymentStatus ?? "paid",
        metadata: { userId: extra.metadataUser ?? session.userId, capability: PAID_CAPABILITY },
      },
    },
  };
}

async function userIdOf(accounts: ReturnType<typeof setup>, cookie: string | null) {
  const session = await accounts.service.getSession(request("/", { cookie }));
  if (session.status !== "signed-in") throw new Error("Expected a signed-in user.");
  return session.user.id;
}

async function startCheckout(accounts: ReturnType<typeof setup>, cookie: string | null) {
  const result = await accounts.service.createCheckout(request("/api/checkout", { method: "POST", cookie }), { capability: PAID_CAPABILITY });
  if (!result.ok) throw new Error(result.error.message);
  return result.data.url.split("/").at(-1) as string;
}

const preferences: Preferences = {
  acidity: "low", sweetness: "high", roast: "medium", milk: "dairy",
  flavors: ["chocolate"], preparationMethods: ["espresso"], notes: "Something cozy.",
};

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("without configuration", () => {
  it("reports unavailable instead of a signed-out or signed-in user", async () => {
    const accounts = setup({ database: false });
    const req = request("/", { cookie: `${SESSION_COOKIE}=anything` });
    expect(await accounts.service.getSession(req)).toEqual({ status: "unavailable", user: null });
    expect(await accounts.service.getAccess(req)).toEqual({ capability: PAID_CAPABILITY, status: "unavailable", allowed: false });
    expect(await accounts.service.listSaved(req)).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
    const { result } = await accounts.auth.signUp(request("/", { method: "POST" }), { email: "a@b.co", password: "12345678", displayName: null });
    expect(result).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
  });

  it("refuses a live-mode Stripe key", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("STRIPE_PRICE_ID", "price_unit");
    expect(stripeGateway()).toBeNull();
  });
});

describe("registration, sign-in and sessions", () => {
  it("signs up, keeps the session in an HttpOnly cookie and signs out", async () => {
    const accounts = setup();
    const { cookie } = await accounts.auth.signUp(request("/", { method: "POST" }), {
      email: "Ada@Example.com", password: "correct horse battery", displayName: null,
    });
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    const session = cookieFrom(cookie);
    expect(await accounts.service.getSession(request("/", { cookie: session }))).toMatchObject({
      status: "signed-in", user: { email: "ada@example.com", displayName: null },
    });

    const out = await accounts.auth.signOut(request("/", { method: "POST", cookie: session }));
    expect(out.cookie).toContain("Max-Age=0");
    expect(await accounts.service.getSession(request("/", { cookie: session }))).toEqual({ status: "signed-out", user: null });
  });

  it("rejects a duplicate email, a wrong password and a forged cookie", async () => {
    const accounts = setup();
    await signUp(accounts, "bea@example.com");
    const again = await accounts.auth.signUp(request("/", { method: "POST" }), { email: "BEA@example.com", password: "another password", displayName: null });
    expect(again.result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

    const wrong = await accounts.auth.signIn(request("/", { method: "POST" }), { email: "bea@example.com", password: "wrong password" });
    expect(wrong).toMatchObject({ result: { ok: false, error: { code: "UNAUTHENTICATED" } }, cookie: null });
    const unknown = await accounts.auth.signIn(request("/", { method: "POST" }), { email: "nobody@example.com", password: "wrong password" });
    expect(unknown.result).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });

    const right = await accounts.auth.signIn(request("/", { method: "POST" }), { email: "bea@example.com", password: "correct horse battery" });
    expect(right.result).toMatchObject({ ok: true, data: { status: "signed-in" } });

    const forged = request("/", { cookie: `${SESSION_COOKIE}=forged-token`, origin: "https://atlas.test" });
    expect(await accounts.service.getSession(forged)).toEqual({ status: "signed-out", user: null });
  });

  it("stores only a keyed hash of the session token and a salted password hash", async () => {
    const accounts = setup();
    const cookie = await signUp(accounts, "cy@example.com");
    const token = cookie?.split("=")[1] ?? "";
    const db = createClient({ url: accounts.url });
    const sessions = await db.execute("SELECT token_hash FROM sessions");
    const users = await db.execute("SELECT password_hash FROM users");
    expect(String(sessions.rows[0].token_hash)).not.toContain(token);
    expect(String(users.rows[0].password_hash)).toMatch(/^scrypt\$/);
    expect(String(users.rows[0].password_hash)).not.toContain("correct horse battery");
    db.close();
  });

  it("refuses cross-site writes", async () => {
    const accounts = setup();
    const cookie = await signUp(accounts, "dee@example.com");
    const evil = request("/api/saved", { method: "POST", cookie, origin: "https://evil.example" });
    expect(await accounts.service.saveItem(evil, { itemType: "bean", itemId: BEAN })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const login = await accounts.auth.signIn(request("/", { method: "POST", origin: "https://evil.example" }), { email: "dee@example.com", password: "correct horse battery" });
    expect(login.result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("preferences and saved items", () => {
  it("require sign-in", async () => {
    const accounts = setup();
    expect(await accounts.service.getPreferences(request("/"))).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    expect(await accounts.service.saveItem(request("/", { method: "POST" }), { itemType: "bean", itemId: BEAN })).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });

  it("round-trip per user and never leak between users", async () => {
    const accounts = setup();
    const first = await signUp(accounts, "eve@example.com");
    const second = await signUp(accounts, "fay@example.com");

    expect(await accounts.service.getPreferences(request("/", { cookie: first }))).toEqual({ ok: true, data: null });
    expect(await accounts.service.savePreferences(request("/", { method: "PUT", cookie: first }), preferences)).toEqual({ ok: true, data: preferences });
    expect(await accounts.service.getPreferences(request("/", { cookie: first }))).toEqual({ ok: true, data: preferences });
    expect(await accounts.service.getPreferences(request("/", { cookie: second }))).toEqual({ ok: true, data: null });

    const write = request("/", { method: "POST", cookie: first });
    const saved = await accounts.service.saveItem(write, { itemType: "bean", itemId: BEAN });
    expect(saved).toMatchObject({ ok: true, data: { itemType: "bean", itemId: BEAN } });
    // Saving again keeps one record and its original time.
    const again = await accounts.service.saveItem(write, { itemType: "bean", itemId: BEAN });
    expect(again.ok && saved.ok && again.data.savedAt).toBe(saved.ok && saved.data.savedAt);
    await accounts.service.saveItem(write, { itemType: "drink", itemId: DRINK });

    const list = await accounts.service.listSaved(request("/", { cookie: first }));
    expect(list.ok && list.data.map((item) => `${item.itemType}:${item.itemId}`).sort()).toEqual([`bean:${BEAN}`, `drink:${DRINK}`]);
    expect(await accounts.service.listSaved(request("/", { cookie: second }))).toEqual({ ok: true, data: [] });
    // The second user cannot remove the first user's save.
    expect(await accounts.service.removeSaved(request("/", { method: "DELETE", cookie: second }), { itemType: "bean", itemId: BEAN })).toEqual({ ok: true, data: { removed: false } });
    expect(await accounts.service.removeSaved(request("/", { method: "DELETE", cookie: first }), { itemType: "bean", itemId: BEAN })).toEqual({ ok: true, data: { removed: true } });

    expect(await accounts.service.getPlanningContext(request("/", { cookie: first }))).toMatchObject({
      ok: true, data: { preferences, saved: [{ itemType: "drink", itemId: DRINK }] },
    });
  });

  it("only saves real catalog items, by reference", async () => {
    const accounts = setup();
    const cookie = await signUp(accounts, "gus@example.com");
    const write = request("/", { method: "POST", cookie });
    expect(await accounts.service.saveItem(write, { itemType: "bean", itemId: "bean-not-in-catalog" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await accounts.service.saveItem(write, { itemType: "drink", itemId: BEAN })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("free recommendation quota", () => {
  it("counts free uses down to zero, then stops counting once paid", async () => {
    const accounts = setup();
    const cookie = await signUp(accounts, "hal@example.com");
    const req = request("/", { method: "POST", cookie });
    expect(await accounts.service.getRecommendationAllowance(req)).toEqual({
      ok: true, data: { paid: false, freeLimit: FREE_RECOMMENDATION_LIMIT, freeUsed: 0, freeRemaining: FREE_RECOMMENDATION_LIMIT },
    });
    for (let used = 1; used <= FREE_RECOMMENDATION_LIMIT; used += 1) {
      expect(await accounts.service.recordRecommendationUse(req)).toMatchObject({ ok: true, data: { freeUsed: used } });
    }
    expect(await accounts.service.recordRecommendationUse(req)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await accounts.service.getRecommendationAllowance(req)).toMatchObject({ ok: true, data: { paid: false, freeRemaining: 0 } });

    const sessionId = await startCheckout(accounts, cookie);
    await accounts.handleStripeWebhook(webhookRequest(checkoutEvent("checkout.session.completed", { id: sessionId, userId: await userIdOf(accounts, cookie) })));
    expect(await accounts.service.recordRecommendationUse(req)).toMatchObject({ ok: true, data: { paid: true } });
  });

  it("allows only one concurrent answer to claim the last free use", async () => {
    const accounts = setup();
    const cookie = await signUp(accounts, "parallel@example.com");
    const req = request("/", { method: "POST", cookie });
    for (let used = 1; used < FREE_RECOMMENDATION_LIMIT; used += 1) await accounts.service.recordRecommendationUse(req);

    const results = await Promise.all(Array.from({ length: 5 }, () => accounts.service.recordRecommendationUse(req)));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual(Array.from({ length: 4 }, () =>
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "FORBIDDEN" }) })));
    const db = createClient({ url: accounts.url });
    expect((await db.execute("SELECT used FROM recommendation_usage")).rows[0].used).toBe(FREE_RECOMMENDATION_LIMIT);
    db.close();
  });
});

describe("Stripe test checkout and webhooks", () => {
  it("creates a checkout for the signed-in user only", async () => {
    const accounts = setup();
    expect(await accounts.service.createCheckout(request("/", { method: "POST" }), { capability: PAID_CAPABILITY })).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    const cookie = await signUp(accounts, "ivy@example.com");
    const sessionId = await startCheckout(accounts, cookie);
    expect(accounts.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      userId: await userIdOf(accounts, cookie),
      email: "ivy@example.com",
      successUrl: "https://atlas.test/checkout/result?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://atlas.test/checkout/result?canceled=1",
    }));
    expect(sessionId).toMatch(/^cs_test_/);
  });

  it("reports checkout unavailable when Stripe is not configured", async () => {
    const accounts = setup({ payments: false });
    const cookie = await signUp(accounts, "jo@example.com");
    expect(await accounts.service.createCheckout(request("/", { method: "POST", cookie }), { capability: PAID_CAPABILITY })).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
  });

  it("grants access only from a verified webhook, exactly once", async () => {
    const accounts = setup();
    const cookie = await signUp(accounts, "kai@example.com");
    const userId = await userIdOf(accounts, cookie);
    const sessionId = await startCheckout(accounts, cookie);

    // Returning from Stripe's redirect changes nothing.
    const redirect = request(`/api/access?session_id=${sessionId}&paid=true`, { cookie });
    expect(await accounts.service.getAccess(redirect)).toMatchObject({ status: "denied", allowed: false });
    expect(await accounts.service.getCheckoutState(redirect, sessionId)).toMatchObject({ ok: true, data: { status: "open", access: { allowed: false } } });

    const event = checkoutEvent("checkout.session.completed", { id: sessionId, userId });
    expect(await accounts.handleStripeWebhook(webhookRequest(event, "whsec_wrong"))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const unsigned = new Request("https://atlas.test/api/webhooks/stripe", { method: "POST", body: JSON.stringify(event) });
    expect(await accounts.handleStripeWebhook(unsigned)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await accounts.service.getAccess(redirect)).toMatchObject({ allowed: false });

    expect(await accounts.handleStripeWebhook(webhookRequest(event))).toEqual({ ok: true, data: { received: true, outcome: "granted" } });
    expect(await accounts.handleStripeWebhook(webhookRequest(event))).toEqual({ ok: true, data: { received: true, outcome: "duplicate" } });
    // A different event for the same session still grants only once.
    await accounts.handleStripeWebhook(webhookRequest(checkoutEvent("checkout.session.async_payment_succeeded", { id: sessionId, userId })));

    expect(await accounts.service.getAccess(request("/", { cookie }))).toEqual({ capability: PAID_CAPABILITY, status: "granted", allowed: true });
    expect(await accounts.service.getCheckoutState(request("/", { cookie }), sessionId)).toMatchObject({ ok: true, data: { status: "paid", access: { allowed: true } } });
    const db = createClient({ url: accounts.url });
    expect((await db.execute("SELECT COUNT(*) AS n FROM entitlements")).rows[0].n).toBe(1);
    db.close();

    // Already unlocked: no second checkout.
    expect(await accounts.service.createCheckout(request("/", { method: "POST", cookie }), { capability: PAID_CAPABILITY })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("keeps access per user", async () => {
    const accounts = setup();
    const payer = await signUp(accounts, "lee@example.com");
    const other = await signUp(accounts, "max@example.com");
    const sessionId = await startCheckout(accounts, payer);
    await accounts.handleStripeWebhook(webhookRequest(checkoutEvent("checkout.session.completed", { id: sessionId, userId: await userIdOf(accounts, payer) })));
    expect(await accounts.service.getAccess(request("/", { cookie: other }))).toMatchObject({ status: "denied", allowed: false });
    expect(await accounts.service.getCheckoutState(request("/", { cookie: other }), sessionId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("ignores unknown sessions, mismatched metadata and live-mode events", async () => {
    const accounts = setup();
    const cookie = await signUp(accounts, "ned@example.com");
    const intruder = await signUp(accounts, "oz@example.com");
    const userId = await userIdOf(accounts, cookie);
    const sessionId = await startCheckout(accounts, cookie);
    const ignored = { ok: true, data: { received: true, outcome: "ignored" } };

    expect(await accounts.handleStripeWebhook(webhookRequest(checkoutEvent("checkout.session.completed", { id: "cs_test_unknown", userId })))).toEqual(ignored);
    expect(await accounts.handleStripeWebhook(webhookRequest(checkoutEvent("checkout.session.completed", { id: sessionId, userId }, { metadataUser: await userIdOf(accounts, intruder) })))).toEqual(ignored);
    expect(await accounts.handleStripeWebhook(webhookRequest(checkoutEvent("checkout.session.completed", { id: sessionId, userId }, { livemode: true })))).toEqual(ignored);
    expect(await accounts.handleStripeWebhook(webhookRequest({ ...checkoutEvent("customer.created", { id: sessionId, userId }) }))).toEqual(ignored);
    expect(await accounts.service.getAccess(request("/", { cookie }))).toMatchObject({ allowed: false });
  });

  it("waits for delayed payments and records failures and expiry without granting", async () => {
    const accounts = setup();
    const cookie = await signUp(accounts, "pia@example.com");
    const userId = await userIdOf(accounts, cookie);
    const delayed = await startCheckout(accounts, cookie);
    const status = async (id: string) => {
      const state = await accounts.service.getCheckoutState(request("/", { cookie }), id);
      return state.ok ? state.data.status : null;
    };

    await accounts.handleStripeWebhook(webhookRequest(checkoutEvent("checkout.session.completed", { id: delayed, userId, paymentStatus: "unpaid" })));
    expect(await status(delayed)).toBe("processing");
    expect(await accounts.service.getAccess(request("/", { cookie }))).toMatchObject({ allowed: false });
    await accounts.handleStripeWebhook(webhookRequest(checkoutEvent("checkout.session.async_payment_failed", { id: delayed, userId })));
    expect(await status(delayed)).toBe("failed");

    const abandoned = await startCheckout(accounts, cookie);
    await accounts.handleStripeWebhook(webhookRequest(checkoutEvent("checkout.session.expired", { id: abandoned, userId, paymentStatus: "unpaid" })));
    expect(await status(abandoned)).toBe("expired");
    expect(await accounts.service.getAccess(request("/", { cookie }))).toMatchObject({ allowed: false });

    const retried = await startCheckout(accounts, cookie);
    await accounts.handleStripeWebhook(webhookRequest(checkoutEvent("checkout.session.completed", { id: retried, userId, paymentStatus: "unpaid" })));
    await accounts.handleStripeWebhook(webhookRequest(checkoutEvent("checkout.session.async_payment_succeeded", { id: retried, userId })));
    // A late "completed (unpaid)" redelivery must not undo the confirmed payment.
    await accounts.handleStripeWebhook(webhookRequest(checkoutEvent("checkout.session.completed", { id: retried, userId, paymentStatus: "unpaid" })));
    expect(await status(retried)).toBe("paid");
    expect(await accounts.service.getAccess(request("/", { cookie }))).toMatchObject({ status: "granted", allowed: true });
  });
});

describe("sign-in throttling and housekeeping", () => {
  it("refuses sign-in after repeated failures, then allows it again once the window passes", async () => {
    const clock = { now: new Date("2026-10-20T10:00:00Z") };
    const accounts = setup({ clock });
    await signUp(accounts, "quinn@example.com");
    const attempt = (password: string) =>
      accounts.auth.signIn(request("/", { method: "POST" }), { email: "Quinn@example.com", password });
    for (let i = 0; i < 10; i += 1) expect((await attempt("wrong password")).result).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    // Even the right password is refused while the email is throttled.
    expect((await attempt("correct horse battery")).result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    clock.now = new Date("2026-10-20T10:16:00Z");
    expect((await attempt("correct horse battery")).result).toMatchObject({ ok: true, data: { status: "signed-in" } });
    // A success clears this email's failures.
    expect((await attempt("wrong password")).result).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("deletes expired sessions on sign-in", async () => {
    const clock = { now: new Date("2026-01-01T00:00:00Z") };
    const accounts = setup({ clock });
    await signUp(accounts, "rae@example.com");
    clock.now = new Date("2026-03-01T00:00:00Z");
    await accounts.auth.signIn(request("/", { method: "POST" }), { email: "rae@example.com", password: "correct horse battery" });
    const db = createClient({ url: accounts.url });
    expect((await db.execute("SELECT COUNT(*) AS n FROM sessions")).rows[0].n).toBe(1);
    db.close();
  });
});

describe("checkout offer and Stripe failures", () => {
  it("shows the configured price, and no price when Stripe can't be read", async () => {
    const accounts = setup();
    expect(await accounts.checkoutOffer()).toEqual({ ok: true, data: { capability: PAID_CAPABILITY, price: { unitAmount: 499, currency: "usd" } } });
    accounts.getPrice.mockRejectedValueOnce(new Error("stripe down"));
    expect(await accounts.checkoutOffer()).toEqual({ ok: true, data: { capability: PAID_CAPABILITY, price: null } });
    expect(await setup({ payments: false }).checkoutOffer()).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
  });

  it("reports a retryable error, and records nothing, when Stripe can't create the checkout", async () => {
    const accounts = setup();
    const cookie = await signUp(accounts, "sam@example.com");
    accounts.createCheckoutSession.mockRejectedValueOnce(new Error("stripe down"));
    expect(await accounts.service.createCheckout(request("/", { method: "POST", cookie }), { capability: PAID_CAPABILITY }))
      .toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE", retryable: true } });
    const db = createClient({ url: accounts.url });
    expect((await db.execute("SELECT COUNT(*) AS n FROM checkout_sessions")).rows[0].n).toBe(0);
    db.close();
  });
});
