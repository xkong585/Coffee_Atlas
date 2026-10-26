# Accounts, saved items and payments (Member 3, `codex/catalog-data`)

Routes: `/login`, `/signup`, `/account`, `/saved`, `/upgrade`, `/checkout/result`. API: `/api/auth/{signup,login,logout}`, `/api/session`, `/api/preferences`, `/api/saved`, `/api/usage`, `/api/access`, `/api/checkout`, `/api/checkout/status`, `/api/webhooks/stripe`.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| User store | SQLite through libSQL (`@libsql/client`): a local file in development, Turso when hosted | No setup locally, a free hosted option that works from serverless functions, one client for both. The schema (`server/db.ts`) is created on first use. |
| Identity | Our own email + password | No third-party provider account to set up. Passwords are hashed with scrypt; the session is a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` on HTTPS), stored only as an HMAC with `AUTH_SECRET`, valid 30 days. |
| Paid benefit (agreed) | 3 free AI recommendations per account, then a **one-time** Stripe test payment unlocks unlimited recommendations | The free ones show the AI's value; payment changes real behavior. One-time avoids subscription renewals and cancellations. |
| Payment provider | Stripe Checkout, **test mode only** | A `sk_live_` key is refused, and live-mode events are ignored. |

## Security rules

- Identity comes only from the session cookie. No route takes a user ID, price, entitlement or redirect URL from the browser.
- Writes from another site's `Origin` are refused (`FORBIDDEN`) on top of `SameSite=Lax`.
- After 10 failed sign-ins for one email within 15 minutes, sign-in for that email is refused (`FORBIDDEN`) until the window passes, even with the right password. A successful sign-in clears that email's failures and deletes expired sessions.
- Every query is scoped to the signed-in user: a user can't read or change another user's preferences, saves, quota or checkouts.
- Saved items store only `{itemType, itemId, savedAt}` and must exist in the catalog.
- **Access is granted only by a verified Stripe webhook.** `/checkout/result` polls `/api/checkout/status`; the redirect itself changes nothing. A webhook counts only if its signature is valid, it is in test mode, and it is for a checkout this app created for that same user (`client_reference_id` and metadata match). Each event ID is processed once, and every write is idempotent (`ON CONFLICT DO NOTHING`, status changes only move forward), so repeated or out-of-order events can't grant twice or undo a payment. A failed write answers 500, so Stripe retries.
- If Stripe can't be reached, checkout answers a retryable `SERVICE_UNAVAILABLE` with a clear message and records nothing. The plans page shows the real price from `STRIPE_PRICE_ID` (`GET /api/checkout`, cached for 10 minutes) and simply omits it if Stripe can't be read.
- Not handled: refunds and disputes don't revoke access. That is acceptable for a test-mode demo; to add it, store the checkout's `payment_intent` and handle `charge.refunded`.
- Delayed payment methods: `checkout.session.completed` with `payment_status: "unpaid"` marks the checkout `processing`, and `async_payment_succeeded` grants it. `async_payment_failed` and `expired` record the failure without granting anything.

## For the other members

- **Shared save action:** `ui/save-action.tsx` (`<SaveAction itemType itemId itemName />`). It shows whether the item is already saved (one `GET /api/saved` per page) and links to sign-in when needed. It is used on bean and drink pages and on recommendation results.
- **Quota line:** `ui/allowance-note.tsx` shows, under the recommendation form, whether the user must sign in, how many free recommendations are left, or that they are unlocked, and re-reads after each answer.
- **Member 5 (recommendations):** `recommendationService` checks `getRecommendationAllowance(request)` before calling the model and calls `recordRecommendationUse(request)` only after an answer with matches. The final claim is atomic, so concurrent requests cannot deliver more than three free answers; a failed claim or expired session is returned before any matches. Concurrent model calls can still occur while a free use remains. Signed out gives 401, quota used up gives 403, and the form shows Sign in / See the unlock links.
- **Member 4 (trip map):** `services.accounts.getPlanningContext(request)` returns `{ preferences, saved }` for the signed-in user or the usual `UNAUTHENTICATED` / `SERVICE_UNAVAILABLE` errors. The trip service uses it and the shared `SaveAction`. With `TRIP_REQUIRES_ACCESS=true`, `getAccess(request).allowed` checks the same one-time unlock as recommendations; trips do not consume free recommendation uses. The switch remains off by default.

## Local setup

1. `.env.local`: `DATABASE_URL=file:./data/coffee-atlas.db` and `AUTH_SECRET=$(openssl rand -hex 32)`. Accounts, saves and the quota now work.
2. Stripe (optional locally): in the Stripe dashboard, in **test mode**, create a product "Unlimited recommendations" with a one-time price. Put `STRIPE_SECRET_KEY=sk_test_…` and `STRIPE_PRICE_ID=price_…` in `.env.local`. Then run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and put the `whsec_…` it prints in `STRIPE_WEBHOOK_SECRET`. Pay with card `4242 4242 4242 4242`.
3. Hosted setup: see [docs/DEPLOYMENT.md](../../../docs/DEPLOYMENT.md).

## Tests

`tests/unit/accounts-service.test.ts` uses a real SQLite file and real Stripe signature verification, with no network. It covers sign-up and sign-in, sessions, cross-site refusal, isolation between users, catalog-checked saves, the quota, checkout ownership, bad and missing signatures, duplicate and out-of-order events, live-mode and mismatched events, and delayed, failed and expired payments. `tests/unit/recommendations-quota.test.ts` covers the gate in the recommendation service. `scripts/smoke.mjs` runs the account journey against a production build on a fresh database.
