# Main Handoff and Feature Extension Guide

## What main delivers

Main contains the application shell, all feature page entry points, shared contracts, safe server boundaries, configuration template, development examples, and verification commands. It starts without database, authentication, AI, Stripe, or hosting credentials.

The baseline is complete locally when a fresh installation can run the checks, build, and open all documented routes. Preparing this code does not itself create a Git commit, push a branch, set repository permissions, or deploy a website.

## Current status (October 19, 2026)

- The team split is final: Member 2 map, Member 3 catalog/data + accounts, saved items and Stripe payments + integration, Member 4 AI trip map (`codex/ai-trip-map`), Member 5 AI recommendations. [TEAM_BRANCH_PLAN.md](../TEAM_BRANCH_PLAN.md) is the source of truth.
- Member 2's map (`codex/map-experience`) is already merged into `main`. Its country/region preview data is development-only (behind `ENABLE_DEV_FIXTURES`); the real catalog is still Member 3's.
- Members 3, 4 and 5 start their branches from the **latest** `main`, not from the original foundation commit.
- Update (October 20): `codex/catalog-data` implements the catalog, accounts, saved items and Stripe test payments; AI recommendations are merged. The agreed paid benefit is 3 free AI recommendations per account, then a one-time unlock. The AI trip map is still open; Member 4 reads user data through `services.accounts.getPlanningContext(request)`.
- Integration review (October 20): `codex/ai-trip-map` now includes the corrected catalog/account branch, resolves the shared-file conflicts, uses the shared account context and save action, and tests the same Stripe unlock with trips. Merge catalog/accounts first, then trips. See [merge readiness](MERGE_READINESS.md) for the exact merge method and configuration.

The steps below describe the original foundation handoff. Today, create a new branch from the latest `main` (`git switch main`, `git pull --ff-only`, `git switch -c <your branch>`).

## Share the baseline

1. Review the working changes and run `npm run verify`.
2. In GitHub Desktop, confirm the current branch is `main`, commit the reviewed foundation, and push it to the team's repository.
3. Share the exact baseline commit with all four members. Confirm repository access and that Member 3 can manage the later merges.
4. Each member clones into their own working directory, checks out that same baseline on `main`, and creates only their assigned branch. No teammate needs another feature branch to begin.

The branch names are:

```text
codex/map-experience
codex/catalog-data
codex/ai-trip-map
codex/ai-recommendations
```

For example, after fetching the shared baseline in their own clone, Member 2 can use:

```sh
git switch main
git pull --ff-only
git rev-parse HEAD
git switch -c codex/map-experience
npm ci
npm run dev
```

Confirm the printed commit matches the shared baseline before creating the branch. These are handoff instructions, not a statement that branches or remote commits already exist.

## Extension recipe

All feature owners should first read [CONTRACTS.md](CONTRACTS.md), [OWNERSHIP.md](OWNERSHIP.md), and their assignment in [TEAM_BRANCH_PLAN.md](../TEAM_BRANCH_PLAN.md).

### Member 2 — Map and exploration

- Extend the existing map-experience UI module and exploration/detail page entry points.
- Build against the catalog schemas and explicitly labeled development examples while Member 3 implements storage.
- Preserve stable IDs in detail and recommendation links. Check that a selected region belongs to its country.
- Connect Member 3's shared saving behavior and Member 5's documented recommendation context rather than duplicating those features.
- Work with Member 4 so the trip route is drawn on the existing globe rather than on a second map.
- Retain readable empty/error states and a basic browsing route when the map cannot load.

### Member 3 — Catalog, accounts, payments, and integration

- Replace the catalog server boundary's unavailable behavior with validated reads from sourced records.
- Keep bean origin, drink associations, source references, and pairing types consistent with the shared contracts.
- Add real data and a reproducible import process; development fixtures remain examples.
- Implement authentication and the account server boundary before enabling user-specific persistence.
- Obtain identity from the server's session; never accept a browser-supplied user ID as authorization.
- Implement preference/save operations, the corresponding pages, and a reusable save action. Let the trip map read the current user's preferences and saved items on the server.
- Agree on a concrete paid benefit with the paid feature's owner, then connect Stripe **test** checkout, verified webhooks, and persisted access state.
- Keep access denied when identity, entitlement, or payment verification is unavailable. Handle duplicate events and delayed updates.
- Coordinate shared-file changes and the four pull requests, then own final hosting and documentation assembly.

### Member 4 — AI trip map

- Add a trip map module, page, and server route for an AI-generated future coffee destination trip.
- Send the user's preferences and saved items (from Member 3's account interfaces) to the server; the server calls the AI model with the key from a server environment variable.
- Give the model only the catalog's existing country/region IDs as allowed stops. Validate every returned stop on the server before responding.
- Return a structured itinerary: ordered stops, a recommendation for each stop, and the reason for it. Add its schema to `src/contracts/` with Member 3.
- Draw the route on the existing globe with a stop-by-stop list, coordinating the map layer with Member 2.
- Share the server-side AI client and key handling with Member 5. If the agreed paid benefit is the trip map, enforce access on the server before running it.

### Member 5 — AI and preferences

- Extend the preference and recommendation UI using the existing request schema.
- Connect real catalog candidates and a server-side model provider; validate output against existing IDs and sources.
- Return explanations, trade-offs, and honest no-match/clarification/failure states.
- Use Member 3's preference persistence and save interface. If the agreed paid benefit belongs here, enforce access on the server before running it.
- Share one server-side AI client and key handling with Member 4: Member 5 recommends what coffee to drink, Member 4 plans where to go to drink it.

## Configuration and service provisioning

No external service variables are required by the foundation. `.env.example` documents the optional fixture flag and reserved names for future integrations. `DATABASE_URL`, `AUTH_SECRET`, the Stripe variables, and `MODEL_API_KEY`/`MODEL_NAME` do not connect anything by themselves; `APP_URL` is also reserved for later integration. Feature owners may refine these names when selecting providers, keep example secrets empty, and document which values are server-only.

| Setup | Later owner |
|---|---|
| Catalog store, data import, hosting and deployment configuration | Member 3 |
| Authentication provider, user storage and Stripe test credentials/webhook setup | Member 3 |
| Model provider, model credentials and recommendation configuration | Member 5, shared with Member 4 |
| Trip-planning prompt and itinerary validation | Member 4 |
| Map library/provider, if needed | Member 2, coordinating dependencies with Member 3 |

Any key that can authorize a provider call must stay out of client bundles and public environment variables. The coordinator collects configuration names and setup instructions, not secrets in documentation or pull requests.

## Decisions that continue after handoff

| Decision | Owner |
|---|---|
| Country/region coverage and researched content | Member 3 with Members 2 and 5 |
| Storage, identity, model and hosting providers | The relevant service owner, coordinated by Member 3 |
| Concrete paid benefit and payment model | Member 3 and the paid feature owner |
| Final map design and geographic navigation | Member 2 |
| Recommendation interpretation, grounding and failure behavior | Member 5 |
| Trip stop selection, validation and route display | Member 4, with Member 2 for the globe |

These decisions are part of the feature work and do not require Member 1 to return before others can progress.

## Integration and submission

Member 3 integrates catalog/account capabilities early, then connects map, recommendations, the trip map, payment/access, and the public deployment. Each author supplies checks and fixes for their own module. As a service is implemented, replace its foundation-only unavailable assertions in unit tests and `scripts/smoke.mjs` with checks for real behavior; keep input validation, identity/access protection, error handling, and production fixture isolation covered. Run the checks after integration.

The final hosted demonstration must use real catalog content, registration/login, grounded AI recommendations, a validated AI trip map, saved state, Stripe test payment, and the agreed paid benefit. Update the architecture and README to match that system. Complete the remaining write-up sections from actual implementation and results, keeping the professor's 4–5-page limit.
