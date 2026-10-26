# AI recommendations (Member 5, `codex/ai-recommendations`)

Route: `/recommendations` (page) and `POST /api/recommendations` (unchanged route, real `recommendationService` behind it).

## How a recommendation is made

1. **Catalog** (`server/catalog-source.ts`): reads the whole snapshot from the catalog service. Like the map, only when that service is unavailable *and* `NODE_ENV=development` with `ENABLE_DEV_FIXTURES=true` does the map's preview catalog stand in, and the page shows the "Development preview" notice.
2. **Checks in code** (`lib/candidates.ts`): the requested country, region and starting item must exist (region inside its country), else `INVALID_INPUT`. All-"any" preferences with no flavors, methods or notes get a `no-match` that asks for one preference, with no model call.
3. **Candidates in code**: `selected` scope keeps beans grown in the area (a country-level bean is not counted for a region) and drinks associated with it (a country-level association covers its regions). `global` keeps everything and only tells the model where the user was browsing. The starting item is excluded and described separately. No candidates → `no-match` with "search all locations" / "include beans or drinks" suggestions, with no model call.
4. **Model** (`lib/prompt.ts`, `src/lib/server/ai-client.ts`): Claude ranks and explains *only* the candidates, citing only their source IDs. User notes go inside `<user_notes>` and are treated as data. Output is structured JSON (`lib/model-output.ts`).
5. **Validation**: every recommended item must be an offered candidate, unique and with a reason; unknown source IDs are dropped (falling back to the item's own sources); results are cut to `limit`. An invalid answer is retried once with the problem stated, then reported as `INTERNAL_ERROR` (retryable). Never shown unchecked.

Errors: no key → `SERVICE_UNAVAILABLE` (not retryable); rate limit / outage / timeout → `SERVICE_UNAVAILABLE` (retryable); model refusal → `INTERNAL_ERROR`. Provider failures never become a `no-match`.

## Shared AI client (also for Member 4)

`src/lib/server/ai-client.ts` exports `generateStructured({ system, prompt, schema, effort? })` → `{ ok: true, data }` or `{ ok: false, failure: { kind: "not-configured" | "provider" | "refused" | "invalid-output" } }`. It uses the official `@anthropic-ai/sdk` (exact pin `0.131.0`), structured outputs from a plain Zod object schema (validate refinements yourself afterwards), a 60 s timeout with one SDK retry, and the server-side refusal fallback (`fallbacks: "default"`). The trip map should call the same function rather than create a second client.

## Configuration (server environment only)

| Variable | Meaning |
|---|---|
| `MODEL_API_KEY` | Anthropic API key. Without it the page works but answers "AI recommendations aren’t configured". Never prefix with `NEXT_PUBLIC_`, never commit. |
| `MODEL_NAME` | Optional. Defaults to `claude-sonnet-5-5` (lower cost, about 6 s per recommendation); `claude-opus-5-5` is slower and costs about twice as much. |

Local try-out: put `ENABLE_DEV_FIXTURES=true` and `MODEL_API_KEY=...` in `.env.local`, run `npm run dev`, open `/explore`, pick a place or bean and use "Get recommendations like this".

## Page

`/recommendations` shows `ui/recommendation-quiz.tsx` (client): one question per screen as two to four large cards (item type, the place when the link carries one, acidity, sweetness, roast, milk, four head-to-head flavor rounds, preparation methods, optional notes). Each winner of a flavor round joins `flavors`; the request and the recommendation logic are unchanged. Signed-out visitors first see a sign-in card (skippable; answers that hit a 401 are kept in `sessionStorage` and sent after signing in). Signed-in users with saved preferences can reuse them or retake the quiz. Finishing the quiz saves the answers with `PUT /api/preferences`.

`/recommendations/classic` keeps the original one-page form below and is linked as "Edit preferences".

`ui/recommendation-form.tsx` (client): item type, search area (asked explicitly when the link carries a place but no `scope`), starting item (removable), acidity / sweetness / roast / milk, flavor chips plus free-text flavors, preparation methods and free-text notes. It pre-fills from `GET /api/preferences` when accounts are connected and can save via `PUT /api/preferences` (401 → sign-in hint, 503 → "isn't available yet"). Results link to the bean/drink pages, list reasons, trade-offs and sources, and use the shared `SaveAction` from the accounts module.

## Integration notes

- **Member 3:** the real catalog and accounts are connected, and the form uses the shared `SaveAction`.
- **Paid benefit (agreed):** a signed-in user gets 3 free recommendations, then needs the one-time unlock. `recommend` checks `quota.getRecommendationAllowance(request)` after the free no-model checks and before the model call (401 signed out, 403 quota used up), and calls `recordRecommendationUse` only for an answer with matches. The form shows Sign in / See the unlock links for those errors, and the accounts module's `AllowanceNote` under the buttons says up front how many free ones are left. Tests: `tests/unit/recommendations-quota.test.ts`.

## Tests

`tests/unit/recommendations-service.test.ts` (fake model, no network): candidate selection, reference checks, the no-model `no-match` cases, validation and source filtering, the retry, failure mapping, the missing-key path, deep-link defaults and the display lookup.

Live runs against Claude (normal and failure cases, screenshots, limitations) are recorded in [EVIDENCE.md](EVIDENCE.md).
