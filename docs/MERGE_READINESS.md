# Catalog/accounts and trip-map integration

## Merge order

The original [PR #2](https://github.com/HarryYuTou/440_Final_Project/pull/2) and [PR #3](https://github.com/HarryYuTou/440_Final_Project/pull/3) are closed without merging. Open new PRs from the updated branches:

1. Merge `codex/catalog-data` into `main` using **Create a merge commit**.
2. Merge `codex/ai-trip-map` into `main`.

The trip branch contains the catalog branch through a merge commit, with `.env.example`, `docs/CONTRACTS.md`, and `scripts/smoke.mjs` conflicts resolved. Preserving the first PR's commits lets Git recognize the shared history. Squashing or rebasing the catalog PR would change that history and may require updating the trip PR before merging. No PR is created, reopened, or merged by this integration work.

## Corrections

- Catalog/accounts: atomic free-use claims and error propagation prevent parallel requests from delivering extra free recommendations. Shared saved state resets on account changes and synchronizes buttons. Logout failures remain visible. Post-login destinations reject control characters and backslashes.
- Trips: shared `SaveAction` and `getPlanningContext` replace the old integration points. Account read failures are preserved. Late prefill cannot overwrite form edits, and explicitly cleared preferences override stored taste. Coverage requires two compatible places and distinct items before calling the model.
- Paid integration: the same verified Stripe `personalized-discovery` entitlement grants unlimited recommendations and trips when the trip gate is enabled. Trips do not consume recommendation quota. The plans page describes the actual enabled benefits at request time.

## Verification

Both branches run `npm run verify`: TypeScript, lint, all unit/integration tests, production build, and HTTP smoke tests on a fresh temporary database. The trip branch additionally tests account context, the shared signed-webhook unlock, isolation between accounts, and the trip gate on and off. No live model or hosted Stripe transaction is required by these deterministic tests; the original real-Claude evidence remains in `src/modules/trip-map/README.md` and is labeled as pre-integration evidence.

Local integration verification on October 20, 2026: catalog/accounts passed **392 tests** and the 13-page production smoke; combined trip branch passed **441 tests** and the 14-page production smoke, including paid trips on and off.

## Deployment configuration

`TRIP_REQUIRES_ACCESS=false` remains the repository default, preserving the team's pending product decision. Set it to `true` on the server to enable the proposed shared paid benefit; no code or new Stripe product is needed. Recommendations continue to offer three free answers and the one-time unlimited unlock in either mode.

The deployment owner still supplies the shared Anthropic key, Stripe test credentials and one-time price, and production database/hosting configuration. See [deployment steps](DEPLOYMENT.md). Credentials and service provisioning are separate from merging these branches.
