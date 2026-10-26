import "server-only";
import type { Client, InStatement } from "@libsql/client";
import type Stripe from "stripe";
import {
  type AccountsService,
  type ApiFailure,
  type ApiResult,
  type CatalogService,
  type CheckoutOffer,
  type CheckoutStatus,
  FREE_RECOMMENDATION_LIMIT,
  PAID_CAPABILITY,
  type PaidAccess,
  type Preferences,
  preferencesSchema,
  type RecommendationAllowance,
  type SavedItem,
  type SessionState,
  type SessionUser,
  type SignInInput,
  type SignUpInput,
  success,
} from "@/contracts";
import {
  hashPassword,
  newSessionToken,
  newUserId,
  sessionTokenHash,
  spendPasswordCheck,
  verifyPassword,
} from "./crypto";
import type { PaymentGateway } from "./stripe";

export const SESSION_COOKIE = "coffee_atlas_session";
const SESSION_DAYS = 30;
const MAX_SAVED_ITEMS = 500;
/** After this many failed sign-ins for one email within the window, sign-in is refused until it passes. */
const MAX_FAILED_SIGN_INS = 10;
const FAILED_SIGN_IN_WINDOW_MS = 15 * 60_000;

export interface AccountsDeps {
  /** Null when DATABASE_URL is not configured. */
  database(): Promise<Client | null>;
  /** AUTH_SECRET; null (or shorter than 32 characters) keeps accounts unavailable. */
  secret(): string | null;
  catalog: CatalogService;
  /** Null when Stripe test mode is not configured. */
  payments(): PaymentGateway | null;
  /** APP_URL, used for Stripe return URLs; falls back to the request's origin. */
  appUrl(): string | null;
  now(): Date;
}

const fail = (code: ApiFailure["error"]["code"], message: string, retryable = false): ApiFailure =>
  ({ ok: false, error: { code, message, retryable } });
const accountsUnavailable = fail("SERVICE_UNAVAILABLE", "Accounts aren’t connected on this server.");
const signInRequired = (action: string) => fail("UNAUTHENTICATED", `Sign in to ${action}.`);
const crossSite = fail("FORBIDDEN", "This request must come from the Coffee Atlas site.");

type Identity =
  | { kind: "unavailable" }
  | { kind: "signed-out" }
  | { kind: "signed-in"; db: Client; user: SessionUser };

type Ready = { db: Client; secret: string };

export type AuthResult = { result: ApiResult<SessionState>; cookie: string | null };
export type WebhookOutcome = "granted" | "updated" | "ignored" | "duplicate";

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

/** Browsers send Origin on cross-site writes; refuse any that is not this site. */
function fromOtherSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || request.method === "GET" || request.method === "HEAD") return false;
  try {
    return new URL(origin).host !== (request.headers.get("host") ?? new URL(request.url).host);
  } catch {
    return true;
  }
}

function sessionCookie(request: Request, token: string | null, expires: Date | null): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const value = token ?? "";
  const expiry = expires ? `; Expires=${expires.toUTCString()}` : "; Max-Age=0";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}${expiry}`;
}

const toUser = (row: Record<string, unknown>): SessionUser => ({
  id: String(row.id),
  email: row.email === null ? null : String(row.email),
  displayName: row.display_name === null ? null : String(row.display_name),
});

export function createAccounts(deps: AccountsDeps) {
  async function ready(): Promise<Ready | null> {
    const secret = deps.secret();
    if (!secret || secret.length < 32) return null;
    const db = await deps.database();
    return db ? { db, secret } : null;
  }

  async function identify(request: Request): Promise<Identity> {
    let setup: Ready | null;
    try {
      setup = await ready();
    } catch (error) {
      console.error("Account database is unreachable.", error);
      return { kind: "unavailable" };
    }
    if (!setup) return { kind: "unavailable" };
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return { kind: "signed-out" };
    const found = await setup.db.execute({
      sql: `SELECT u.id, u.email, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > ?`,
      args: [sessionTokenHash(setup.secret, token), deps.now().toISOString()],
    });
    const row = found.rows[0];
    return row ? { kind: "signed-in", db: setup.db, user: toUser(row) } : { kind: "signed-out" };
  }

  /** Runs `operation` for the verified user; identity never comes from the request body. */
  async function asUser<T>(
    request: Request,
    action: string,
    operation: (db: Client, user: SessionUser) => Promise<ApiResult<T>>,
  ): Promise<ApiResult<T>> {
    if (fromOtherSite(request)) return crossSite;
    const identity = await identify(request);
    if (identity.kind === "unavailable") return accountsUnavailable;
    if (identity.kind === "signed-out") return signInRequired(action);
    return operation(identity.db, identity.user);
  }

  async function entitled(db: Client, userId: string): Promise<boolean> {
    const found = await db.execute({
      sql: "SELECT 1 FROM entitlements WHERE user_id = ? AND capability = ?",
      args: [userId, PAID_CAPABILITY],
    });
    return found.rows.length > 0;
  }

  async function allowance(db: Client, userId: string): Promise<RecommendationAllowance> {
    const paid = await entitled(db, userId);
    const found = await db.execute({ sql: "SELECT used FROM recommendation_usage WHERE user_id = ?", args: [userId] });
    const freeUsed = Math.min(Number(found.rows[0]?.used ?? 0), FREE_RECOMMENDATION_LIMIT);
    return { paid, freeLimit: FREE_RECOMMENDATION_LIMIT, freeUsed, freeRemaining: FREE_RECOMMENDATION_LIMIT - freeUsed };
  }

  async function itemExists(reference: { itemType: "bean" | "drink"; itemId: string }): Promise<ApiResult<true>> {
    const found = reference.itemType === "bean"
      ? await deps.catalog.getBean(reference.itemId)
      : await deps.catalog.getDrink(reference.itemId);
    return found.ok ? success(true) : found;
  }

  async function openSession(request: Request, db: Client, secret: string, user: SessionUser): Promise<AuthResult> {
    const token = newSessionToken();
    const now = deps.now();
    const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
    await db.execute({
      sql: "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      args: [sessionTokenHash(secret, token), user.id, now.toISOString(), expires.toISOString()],
    });
    return { result: success({ status: "signed-in", user }), cookie: sessionCookie(request, token, expires) };
  }

  const service: AccountsService = {
    async getSession(request): Promise<SessionState> {
      const identity = await identify(request);
      if (identity.kind === "unavailable") return { status: "unavailable", user: null };
      return identity.kind === "signed-in" ? { status: "signed-in", user: identity.user } : { status: "signed-out", user: null };
    },

    getPreferences: (request) => asUser(request, "see your preferences", async (db, user) => {
      const found = await db.execute({ sql: "SELECT data FROM preferences WHERE user_id = ?", args: [user.id] });
      const row = found.rows[0];
      if (!row) return success(null);
      const parsed = preferencesSchema.safeParse(JSON.parse(String(row.data)));
      return success(parsed.success ? parsed.data : null);
    }),

    savePreferences: (request, input) => asUser(request, "save your preferences", async (db, user) => {
      const preferences: Preferences = preferencesSchema.parse(input);
      await db.execute({
        sql: `INSERT INTO preferences (user_id, data, updated_at) VALUES (?, ?, ?)
              ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        args: [user.id, JSON.stringify(preferences), deps.now().toISOString()],
      });
      return success(preferences);
    }),

    listSaved: (request) => asUser(request, "see your saved coffee", async (db, user) => {
      const found = await db.execute({
        sql: "SELECT item_type, item_id, saved_at FROM saved_items WHERE user_id = ? ORDER BY saved_at DESC, item_id",
        args: [user.id],
      });
      return success(found.rows.map((row): SavedItem => ({
        itemType: row.item_type === "drink" ? "drink" : "bean",
        itemId: String(row.item_id),
        savedAt: String(row.saved_at),
      })));
    }),

    saveItem: (request, input) => asUser(request, "save coffee", async (db, user) => {
      const exists = await itemExists(input);
      if (!exists.ok) return exists;
      const count = await db.execute({ sql: "SELECT COUNT(*) AS n FROM saved_items WHERE user_id = ?", args: [user.id] });
      if (Number(count.rows[0]?.n ?? 0) >= MAX_SAVED_ITEMS) {
        return fail("INVALID_INPUT", `You can keep up to ${MAX_SAVED_ITEMS} saved items. Remove some to save more.`);
      }
      await db.execute({
        sql: `INSERT INTO saved_items (user_id, item_type, item_id, saved_at) VALUES (?, ?, ?, ?)
              ON CONFLICT DO NOTHING`,
        args: [user.id, input.itemType, input.itemId, deps.now().toISOString()],
      });
      const saved = await db.execute({
        sql: "SELECT saved_at FROM saved_items WHERE user_id = ? AND item_type = ? AND item_id = ?",
        args: [user.id, input.itemType, input.itemId],
      });
      return success({ itemType: input.itemType, itemId: input.itemId, savedAt: String(saved.rows[0]?.saved_at) });
    }),

    removeSaved: (request, input) => asUser(request, "change your saved coffee", async (db, user) => {
      const removed = await db.execute({
        sql: "DELETE FROM saved_items WHERE user_id = ? AND item_type = ? AND item_id = ?",
        args: [user.id, input.itemType, input.itemId],
      });
      return success({ removed: removed.rowsAffected > 0 });
    }),

    async getAccess(request): Promise<PaidAccess> {
      const identity = await identify(request);
      if (identity.kind === "unavailable") return { capability: PAID_CAPABILITY, status: "unavailable", allowed: false };
      if (identity.kind === "signed-in" && await entitled(identity.db, identity.user.id)) {
        return { capability: PAID_CAPABILITY, status: "granted", allowed: true };
      }
      return { capability: PAID_CAPABILITY, status: "denied", allowed: false };
    },

    createCheckout: (request) => asUser(request, "unlock unlimited recommendations", async (db, user) => {
      const payments = deps.payments();
      if (!payments) return fail("SERVICE_UNAVAILABLE", "Checkout isn’t connected on this server.");
      if (await entitled(db, user.id)) return fail("INVALID_INPUT", "Unlimited recommendations are already unlocked on your account.");
      const base = (deps.appUrl() ?? new URL(request.url).origin).replace(/\/+$/, "");
      let checkout: { id: string; url: string };
      try {
        checkout = await payments.createCheckoutSession({
          userId: user.id,
          email: user.email,
          successUrl: `${base}/checkout/result?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${base}/checkout/result?canceled=1`,
        });
      } catch (error) {
        console.error("Stripe checkout session could not be created.", error);
        return fail("SERVICE_UNAVAILABLE", "We couldn’t reach Stripe to start checkout. Please try again in a moment.", true);
      }
      const now = deps.now().toISOString();
      await db.execute({
        sql: `INSERT INTO checkout_sessions (id, user_id, capability, status, created_at, updated_at)
              VALUES (?, ?, ?, 'open', ?, ?)`,
        args: [checkout.id, user.id, PAID_CAPABILITY, now, now],
      });
      return success({ url: checkout.url });
    }),

    getCheckoutState: (request, sessionId) => asUser(request, "see this checkout", async (db, user) => {
      const found = await db.execute({
        sql: "SELECT status FROM checkout_sessions WHERE id = ? AND user_id = ?",
        args: [sessionId, user.id],
      });
      const row = found.rows[0];
      if (!row) return fail("NOT_FOUND", "This checkout doesn’t belong to your account.");
      const granted = await entitled(db, user.id);
      return success({
        status: String(row.status) as CheckoutStatus,
        access: granted
          ? { capability: PAID_CAPABILITY, status: "granted", allowed: true }
          : { capability: PAID_CAPABILITY, status: "denied", allowed: false },
      });
    }),

    getRecommendationAllowance: (request) =>
      asUser(request, "get AI recommendations", async (db, user) => success(await allowance(db, user.id))),

    recordRecommendationUse: (request) => asUser(request, "get AI recommendations", async (db, user) => {
      if (!await entitled(db, user.id)) {
        const recorded = await db.execute({
          sql: `INSERT INTO recommendation_usage (user_id, used) VALUES (?, 1)
                ON CONFLICT (user_id) DO UPDATE SET used = used + 1
                WHERE used < ?`,
          args: [user.id, FREE_RECOMMENDATION_LIMIT],
        });
        // The earlier allowance check is advisory: another request may finish
        // while the model is running. Claim the final use atomically before
        // delivering its answer, and never turn a failed claim into a free answer.
        if (recorded.rowsAffected === 0 && !await entitled(db, user.id)) {
          return fail("FORBIDDEN", `You’ve used your ${FREE_RECOMMENDATION_LIMIT} free recommendations. Unlock unlimited recommendations to keep going.`);
        }
      }
      return success(await allowance(db, user.id));
    }),

    async getPlanningContext(request) {
      const preferences = await service.getPreferences(request);
      if (!preferences.ok) return preferences;
      const saved = await service.listSaved(request);
      if (!saved.ok) return saved;
      return success({ preferences: preferences.data, saved: saved.data });
    },
  };

  const auth = {
    async signUp(request: Request, input: SignUpInput): Promise<AuthResult> {
      if (fromOtherSite(request)) return { result: crossSite, cookie: null };
      const setup = await ready();
      if (!setup) return { result: accountsUnavailable, cookie: null };
      const email = input.email.trim().toLowerCase();
      const user: SessionUser = { id: newUserId(), email, displayName: input.displayName };
      const inserted = await setup.db.execute({
        sql: `INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT (email) DO NOTHING`,
        args: [user.id, email, input.displayName, await hashPassword(input.password), deps.now().toISOString()],
      });
      if (inserted.rowsAffected === 0) {
        return { result: fail("INVALID_INPUT", "An account with this email already exists. Sign in instead."), cookie: null };
      }
      return openSession(request, setup.db, setup.secret, user);
    },

    async signIn(request: Request, input: SignInInput): Promise<AuthResult> {
      if (fromOtherSite(request)) return { result: crossSite, cookie: null };
      const setup = await ready();
      if (!setup) return { result: accountsUnavailable, cookie: null };
      const email = input.email.trim().toLowerCase();
      const now = deps.now();
      const windowStart = new Date(now.getTime() - FAILED_SIGN_IN_WINDOW_MS).toISOString();
      const failures = await setup.db.execute({
        sql: "SELECT COUNT(*) AS n FROM login_failures WHERE email = ? AND failed_at > ?",
        args: [email, windowStart],
      });
      if (Number(failures.rows[0]?.n ?? 0) >= MAX_FAILED_SIGN_INS) {
        return { result: fail("FORBIDDEN", "Too many sign-in attempts for this email. Try again in 15 minutes."), cookie: null };
      }
      const found = await setup.db.execute({
        sql: "SELECT id, email, display_name, password_hash FROM users WHERE email = ?",
        args: [email],
      });
      const row = found.rows[0];
      let valid = false;
      if (row) valid = await verifyPassword(input.password, String(row.password_hash));
      else await spendPasswordCheck(input.password);
      if (!row || !valid) {
        await setup.db.execute({ sql: "INSERT INTO login_failures (email, failed_at) VALUES (?, ?)", args: [email, now.toISOString()] });
        return { result: fail("UNAUTHENTICATED", "That email and password don’t match an account."), cookie: null };
      }
      // Housekeeping on each successful sign-in: this email's failures, old failures, and expired sessions.
      await setup.db.batch([
        { sql: "DELETE FROM login_failures WHERE email = ? OR failed_at <= ?", args: [email, windowStart] },
        { sql: "DELETE FROM sessions WHERE expires_at <= ?", args: [now.toISOString()] },
      ], "write");
      return openSession(request, setup.db, setup.secret, toUser(row));
    },

    /** Always clears the cookie, even when the database cannot be reached. */
    async signOut(request: Request): Promise<AuthResult> {
      const cleared = sessionCookie(request, null, null);
      if (fromOtherSite(request)) return { result: crossSite, cookie: null };
      const token = readCookie(request, SESSION_COOKIE);
      const setup = await ready().catch(() => null);
      if (setup && token) {
        await setup.db.execute({ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [sessionTokenHash(setup.secret, token)] });
      }
      return { result: success({ status: "signed-out", user: null }), cookie: cleared };
    },
  };

  /**
   * Verified Stripe events are the only way access is granted. Every write is
   * idempotent and runs in one batch, so a repeated or replayed event can
   * neither grant twice nor leave a half-applied update.
   */
  async function handleStripeWebhook(request: Request): Promise<ApiResult<{ received: true; outcome: WebhookOutcome }>> {
    const payments = deps.payments();
    if (!payments) return fail("SERVICE_UNAVAILABLE", "Stripe webhooks aren’t connected on this server.");
    const signature = request.headers.get("stripe-signature");
    if (!signature) return fail("INVALID_INPUT", "Missing Stripe signature.");
    const body = await request.text();
    let event: Stripe.Event;
    try {
      event = await payments.verifyEvent(body, signature);
    } catch {
      return fail("INVALID_INPUT", "The Stripe signature could not be verified.");
    }
    const setup = await ready();
    if (!setup) return fail("SERVICE_UNAVAILABLE", "Accounts aren’t connected on this server.", true);
    const { db } = setup;
    const received = (outcome: WebhookOutcome) => success({ received: true as const, outcome });

    const seen = await db.execute({ sql: "SELECT 1 FROM stripe_events WHERE id = ?", args: [event.id] });
    if (seen.rows.length > 0) return received("duplicate");
    const now = deps.now().toISOString();
    const record: InStatement = {
      sql: "INSERT INTO stripe_events (id, type, received_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
      args: [event.id, event.type, now],
    };

    const handled = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ];
    // Test mode only: a live-mode event never changes access here.
    if (event.livemode || !handled.includes(event.type)) {
      await db.execute(record);
      return received("ignored");
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const found = await db.execute({ sql: "SELECT user_id, capability FROM checkout_sessions WHERE id = ?", args: [session.id] });
    const row = found.rows[0];
    const userId = row ? String(row.user_id) : null;
    // Only sessions this app created for this user, with matching metadata, count.
    if (!userId || session.client_reference_id !== userId || session.metadata?.userId !== userId
      || session.metadata?.capability !== PAID_CAPABILITY || String(row?.capability) !== PAID_CAPABILITY) {
      await db.execute(record);
      return received("ignored");
    }

    const setStatus = (status: CheckoutStatus, onlyFrom: CheckoutStatus[]): InStatement => ({
      sql: `UPDATE checkout_sessions SET status = ?, updated_at = ?
            WHERE id = ? AND status IN (${onlyFrom.map(() => "?").join(", ")})`,
      args: [status, now, session.id, ...onlyFrom],
    });
    const grant: InStatement = {
      sql: `INSERT INTO entitlements (user_id, capability, checkout_session_id, granted_at) VALUES (?, ?, ?, ?)
            ON CONFLICT DO NOTHING`,
      args: [userId, PAID_CAPABILITY, session.id, now],
    };

    const paid = event.type === "checkout.session.async_payment_succeeded"
      || (event.type === "checkout.session.completed" && session.payment_status !== "unpaid");
    if (paid) {
      await db.batch([record, setStatus("paid", ["open", "processing", "failed", "expired"]), grant], "write");
      return received("granted");
    }
    const next: [CheckoutStatus, CheckoutStatus[]] =
      event.type === "checkout.session.completed" ? ["processing", ["open"]]
      : event.type === "checkout.session.async_payment_failed" ? ["failed", ["open", "processing"]]
      : ["expired", ["open"]];
    await db.batch([record, setStatus(...next)], "write");
    return received("updated");
  }

  /** The price shown on the plans page. A missing or failing Stripe lookup gives `price: null`, never an error page. */
  async function checkoutOffer(): Promise<ApiResult<CheckoutOffer>> {
    const payments = deps.payments();
    if (!payments) return fail("SERVICE_UNAVAILABLE", "Checkout isn’t connected on this server.");
    try {
      return success({ capability: PAID_CAPABILITY, price: await payments.getPrice() });
    } catch (error) {
      console.error("Stripe price could not be read.", error);
      return success({ capability: PAID_CAPABILITY, price: null });
    }
  }

  return { service, auth, handleStripeWebhook, checkoutOffer };
}
