# Deployment (Member 3)

The application is hosted on **Vercel**, with accounts connected to **Turso**, AI powered by Anthropic, and payments using Stripe sandbox. The hosted Stripe card-payment/unlock flow is independently verified, and the team reports the complete public-site walkthrough passed on October 21, including recommendations and trip generation. No secret value belongs in Git or in this file.

## Current deployment — October 21, 2026

- **Public URL:** [coffee-atlas-phi.vercel.app](https://coffee-atlas-phi.vercel.app)
- **Vercel project:** `harry-918a/coffee-atlas`
- **Release checked:** Git-source `main` commit `f3536d6` (`updates3`), deployment `dpl_3ZFH9TzL3fLZ4qWCkDE5BrFKMHFM`. Vercel reported Ready with `coffee-atlas-phi.vercel.app` assigned, and its source SHA matched GitHub's latest `main` at the October 21 check.
- **GitHub integration:** connected to [HarryYuTou/440_Final_Project](https://github.com/HarryYuTou/440_Final_Project). Production branch tracking is `main`, with automatic assignment of the production domain enabled. Pushes or merges into `main` trigger a build; successful builds publish to the same public URL. The checked release was verified as a deployment triggered by a GitHub push.
- **Earlier Git-source release checks:** public HTTPS requests to `/`, `/explore`, `/signup`, `/api/session`, and `/api/health` returned 200.
- **Database:** Turso `coffee-atlas`, location `aws-us-east-1`. Database connection settings, the authentication secret, and `APP_URL` are saved only in Vercel's Production environment.
- **Earlier public verification:** unauthenticated HTTPS access to 14 pages, catalog counts of 60 countries / 54 regions / 61 beans / 27 drinks / 33 pairings / 135 sources, bundled map data, and production fixture isolation (404).
- **Hosted account acceptance:** API checks passed registration, login/logout, `Secure`/`HttpOnly`/`SameSite=Lax` cookies, authenticated identity, unauthenticated 401 responses, persistent preferences/saves after re-login, and isolation between users. Browser signup reached the account page with three free credits. A model-unconfigured 503 did not consume a credit. All three temporary acceptance accounts and their test records were removed afterward.
- **Service state:** `/api/health` reports catalog `ready` and accounts, payments, and AI `configured`. This confirms configuration presence, not a successful model generation or payment.
- **Stripe configuration:** one-time USD $5.00 sandbox price. `GET /api/checkout` returns the real Stripe price (500 USD cents), and `/upgrade` displays $5.00. The webhook receives the four checkout events listed below as snapshot events using API version `2026-08-26.dahlia`.
- **Hosted Stripe acceptance:** a browser completed the actual Stripe-hosted USD $5.00 sandbox checkout with Stripe's official `4242` test card, without real funds. The verified webhook recorded the checkout as paid; access and usage APIs reported the paid entitlement. Logout/login retained that entitlement, and the checkout result page confirmed unlimited recommendations were unlocked. The temporary application account and its records were removed afterward; Stripe's sandbox payment and webhook event records were retained.
- **Acceptance limits:** the hosted payment check covered a successful card payment. Failure, delayed-payment, and duplicate-delivery behavior remains covered by local tests; those cases were not freshly exercised against the hosted endpoint. Local verification passed 441 tests across 24 files and the 14-page production smoke.
- **Team manual acceptance (October 21):** following the public-site walkthrough, the team reported all steps passed: browsing, registration, saving, preference persistence, AI recommendation generation, AI trip generation, sandbox payment, and retained account data/access after logout/login, including another recommendation after payment. This is team-reported functional acceptance; no new automated suite or model-quality benchmark was run for this documentation update.

## 1. Database (Turso)

The production database is already connected. These creation commands are reference steps for a fresh environment; do not recreate the existing database:

```sh
turso db create coffee-atlas
turso db show coffee-atlas --url        # → DATABASE_URL (libsql://…)
turso db tokens create coffee-atlas     # → DATABASE_AUTH_TOKEN
```

The tables are created automatically on the first request (`src/modules/accounts/server/db.ts`). A fresh database needs no migration command.

## 2. Stripe (test mode)

The production app is already connected to the Stripe sandbox with a one-time USD $5.00 price and the webhook below. These are reference steps for recreating the configuration:

1. Switch the Stripe dashboard to **Test mode**.
2. Products → add "Coffee Atlas: Unlimited recommendations", with a **one-time USD $5.00** price. Copy the `price_…` ID → `STRIPE_PRICE_ID`.
3. Developers → API keys → the `sk_test_…` secret key → `STRIPE_SECRET_KEY`. Live keys are refused by the app.
4. Developers → Webhooks → add endpoint `https://coffee-atlas-phi.vercel.app/api/webhooks/stripe` with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`. The current endpoint uses snapshot events with API version `2026-08-26.dahlia`. Copy its signing secret (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`, then redeploy.

## 3. Hosting (Vercel)

1. Use the existing Vercel project `harry-918a/coffee-atlas` (framework: Next.js), already connected to `HarryYuTou/440_Final_Project`. Push or merge changes into `main` to trigger a production build; successful builds update the existing public URL.
2. Project → Settings → Environment Variables (Production):

| Name | Value |
|---|---|
| `DATABASE_URL` | Turso URL |
| `DATABASE_AUTH_TOKEN` | Turso token |
| `AUTH_SECRET` | `openssl rand -hex 32` |
| `APP_URL` | `https://coffee-atlas-phi.vercel.app` |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | from step 2 |
| `MODEL_API_KEY`, optional `MODEL_NAME` | shared Anthropic configuration |
| `TRIP_REQUIRES_ACCESS` | `true` to include trips in the same one-time unlock; `false` or unset keeps trips open |

Leave `ENABLE_DEV_FIXTURES` unset.

3. Deploy, then add the webhook (step 2.4) and redeploy.

## 4. Check the live site

1. `GET /api/health` currently shows `catalog: "ready"` and `accounts`, `payments` and `ai` as `"configured"`. This checks configuration presence only; verify the provider-backed journeys below separately.
2. Walk the journey: sign up → explore a country → save a bean → set preferences and get a recommendation (counts down from 3) → Plans → pay with `4242 4242 4242 4242` → the checkout page turns to "unlocked" once the webhook arrives → recommendations keep working after the free ones are used.
3. In Stripe → Webhooks, the deliveries show `200`. Use "Resend" on one: the response says `"duplicate"` and nothing is granted twice.
4. With `TRIP_REQUIRES_ACCESS=true`, open `/trip` before paying: an unpaid account sees the plans link. After the same verified payment, it can plan routes and save recommendations; no separate Stripe product or purchase is needed. `/upgrade` lists both benefits, and trips do not use the three free recommendation credits. The repository default is `false`; set this server variable explicitly when the team enables paid trips.

Any host that runs Next.js on Node.js 22+ works the same way. On a host with a persistent disk, `DATABASE_URL=file:/data/coffee-atlas.db` also works without Turso.
