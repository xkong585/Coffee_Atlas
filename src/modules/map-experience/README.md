# Map experience (Member 2, `codex/map-experience`)

Routes: `/explore`, `/explore/[countryId]`, `/explore/[countryId]/[regionId]`, `/beans/[id]`, `/drinks/[id]`.
Each page file only checks the IDs, calls `await connection()` (so the catalog is read per request), loads through `server/catalog-loader.ts` and renders a screen from `ui/`. Bean and drink routes also have a `loading.tsx` that shows a skeleton shaped like the profile (`ui/detail-skeleton.tsx`) instead of the site-wide loading screen. The explore routes have none on purpose: a fallback there would replace the live map.

## Run it with preview data

1. Run `npm install` (this branch adds `maplibre-gl`).
2. Put `ENABLE_DEV_FIXTURES=true` in `.env.local`, then run `npm run dev`.
3. While `services.catalog` answers `SERVICE_UNAVAILABLE` (the foundation stub does), and only with `NODE_ENV=development` and the flag on, the pages use `dev/preview-catalog.ts` and show a "Development preview data" notice. A production build never does, even with the flag set (`scripts/smoke.mjs` checks this).
4. Walkthrough: `/explore` → Ethiopia → Harar → Harar natural bean → Ethiopian coffee ceremony (a suggested pairing) → "Get recommendations like this". Also try `/explore/vietnam/vietnam-central-highlands` → robusta → cà phê sữa đá (a documented pairing), `/explore/indonesia/indonesia-java` (a region without coordinates), `/explore/italy` (drinks only) and `/beans/bean-kenya-aa` (recorded at country level).
5. The foundation's `example-*` IDs are not in the preview, so in dev they show the not-found page. With the flag off, every page shows "The coffee catalog isn’t connected yet."

The preview is 10 countries, 15 regions, 16 beans, 9 drinks and 8 pairings (2 documented, 6 suggested), each with real cited sources (accessed 2026-10-16). It is development-only and should be deleted once the real catalog is connected.

## Folder map

- `server/catalog-loader.ts`: the only reader of `services.catalog`. It decides ready / unavailable / error / not-found and the preview fallback, and validates service data with the contract schemas.
- `lib/catalog-view.ts`: pure queries over a snapshot (beans grown in a place, drinks associated with it, pairings split into documented and suggested, sources).
- `lib/map-model.ts`: the plain props passed to the client map. `lib/links.ts`: URL builders. `lib/geometry.ts`: outline bounds, globe zoom and world-view centering.
- `ui/explore-map.tsx` and `ui/map/*`: client-only MapLibre code (`keep-alive.ts` keeps one map per tab, `markers.ts` diffs the HTML markers, `camera.ts` frames each view, `motion.ts` times the camera, `arrival.ts` decides the scroll when a page arrives, `style.ts` builds the layers and fades them, `view.ts` decides what a page shows, `types.ts` holds the shared types). `ui/map/labels.ts` is pure and also words the panels' counts. Everything else in `ui/` is server-rendered, and every place the map shows is also listed on the page, so the catalog stays reachable when the map can't load.
- Explore links inside the panel set `scroll={false}` and `data-map-key={mapKey(...)}` (`lib/links.ts`, see `ui/location-lists.tsx`): the map scrolls the new heading into view itself and highlights the matching marker on hover.
- `dev/preview-catalog.ts`: development preview data (see above).

## Integration points

- **Member 3 (catalog):** implement `src/modules/catalog/server/service.ts`; nothing in this module needs to change.
  - `Country.isoCode` must equal `iso` in `public/map/countries.geojson` (Natural Earth `ISO_A2_EH`). French overseas regions (RE, GP, MQ, GF, YT) have no outline of their own, so give them a `center` or they are list-only.
  - `center: null` means no marker and no automatic zoom; it is never treated as (0, 0).
  - Detail pages call `getBean`/`getDrink` and also `list()` for names, sources and pairings.
  - Hovering or focusing a map marker or a list row fully prefetches that explore page (production only: one dynamic render and one catalog read per place, cached per prefetch entry). If the catalog service can't take that, change `FULL_PREFETCH` in `ui/explore-map.tsx` to a plain `router.prefetch(href)`.
  - When the catalog is connected, replace the "isn’t connected yet" assertions and the `example-*` page list in `scripts/smoke.mjs` with real IDs.
  - Shared docs that still describe the old dev data setup: `README.md` ("Development examples"), `.env.example` (the comment above `ENABLE_DEV_FIXTURES`) and `docs/ARCHITECTURE.md` (lists only `map-experience/ui/`). They are Member 3's files, so this branch leaves them alone.
- **Member 3 (saved items):** done. The stand-in button became the shared `SaveAction` (`src/modules/accounts/ui/save-action.tsx`, same props), which now also shows whether the item is already saved.
- **Member 3 (catalog):** done. The preview records are now the real catalog (`src/modules/catalog/data/records.ts`), and `dev/preview-catalog.ts` is only a gate over the same data for the old fallback, which is no longer reached.
- **Member 4 (AI trip map):** draws the trip route and its stops on this module's globe rather than a second map. Agree with Member 2 on how the route layer plugs into `ui/explore-map.tsx` / `ui/map/style.ts`; stops use catalog `center` values, so a stop with `center: null` stays list-only.
- **Member 5 (recommendations):** `lib/links.ts` `recommendationHref` writes only the documented query names `type`, `scope`, `countryId`, `regionId`, `beanId`, `drinkId`. Country and region pages send `scope=selected`. A bean page sends `scope=global` with `beanId` and its origin `countryId`/`regionId`; a drink page sends `drinkId`. The tests check the names and values only, not how the recommendations page displays them.

## Map data and library

- `maplibre-gl@5.24.0`, exact pin. No API key, no tile, style, glyph or sprite servers, so there are no text layers on the canvas; labels are HTML.
- `public/map/countries.geojson`: Natural Earth 1:50m admin-0 countries v5.1.2 (public domain), from `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson`, made with `npx mapshaper@0.7.70 ne50.geojson -filter-fields ISO_A2_EH,NAME_EN -rename-fields iso=ISO_A2_EH,name=NAME_EN -simplify 25% keep-shapes -o precision=0.001 format=geojson countries.geojson`. A few disputed areas have `iso` `-99` and are never matched.
- Gestures: plain wheel and one-finger drags scroll the page; Ctrl/⌘ + wheel or two fingers move the map. With a mouse only a marker's dot and its region name take clicks; touch screens get 44px targets, and a tap between close markers goes to the nearest dot (a tap on a name goes to that region).
- The look is all style layers in `ui/map/style.ts`: a sea-green ocean with three coast bands, four close paper tones for land, olive curated and focused countries (the focused one with an offset shadow), and the tropics with a warm glow. The world globe's shadow is CSS behind the canvas (`explore-map.module.css`), sized from `GLOBE_FILL`.
- Landmark illustrations (`ui/map/landmarks.ts`, art in `public/map/landmarks/`): each coffee country has one well-known building as a small colored SVG (64×64, base on the bottom edge) standing on its marker dot, about 60 px tall in the world view so people can recognize a place without zooming; a region shows its own landmark when the table has one (keyed by region id), otherwise its country's. Countries not in the table keep the plain dot. Where illustrations crowd (Europe, East Africa), only the most important one in each cluster stays up (more content first, then the better-known landmark, see `landmarkFame`); the rest keep their dot and reappear as the map zooms in. **Member 3:** the table is keyed by ISO code and the preview's region ids; add rows (and an SVG) when the real catalog has new countries or other region ids.
- A caption row under the map frame holds the place name (country and region pages), the legend and the credits for Natural Earth and MapLibre as plain links. Only the zoom buttons, hover tooltips and the Ctrl/⌘ + scroll hint appear over the map.

### Known audit warning (risk accepted for now)

`npm audit` reports a critical advisory for `maplibre-gl` ≤ 6.4.0 (GHSA-jrc7-96c5-q579, XSS in `DOM.sanitize`). There is no 5.x fix. It is not reachable here: `DOM.sanitize` is only used by the attribution control, and the map no longer uses it (`attributionControl: false`; the credits are plain links in the caption under the map, written in `explore-map.tsx`). The map also uses no popups, no `setHTML` and no remote styles. Do not bring back the attribution control or add `Popup.setHTML` while on 5.x. Moving to an exact `6.x` pin (≥ 6.4.1, ESM-only) is a dependency change for Member 3 to schedule; check the globe, marker and attribution APIs when doing it.

## Known behavior

- An unknown country, region, bean or drink renders the not-found page with HTTP 200, not 404, because a loading boundary (the root `src/app/loading.tsx`, and for beans and drinks their own `loading.tsx`) starts streaming first. The foundation's pages behave the same way.
- In development (no prefetching) a click from a card to a bean or drink page keeps the old page until the response starts, and can still show the site-wide "Opening your next stop." screen for a few frames when the dev cache is cold (Next's streaming dev render). A production build prefetches the skeleton with each card link, so there it can show at once.
- One MapLibre map per browser tab (`ui/map/keep-alive.ts`). Each explore page renders its own `<ExploreMap>`, and the map moves from the old page to the new one in the same commit, so there is no skeleton or rebuild after the first load. While you are on a bean or drink page it waits off-screen, so Back (or an "Explore …" link) finds it as you left it; after 3 minutes there it is disposed and the next explore page builds a new one.
- The camera starts moving on the click, while the next page is still loading: map markers and outlines, list links and any other `/explore` link (`startIntent` in `explore-map.tsx`). The old panel dims until the new page arrives, for at most 10 s; a slower page still arrives (Next falls back to a full page load if the request fails), and the camera stays on its way. A click back to the page you are on cancels a pending move. The world page hands the map every region, so a country's regions appear as the camera settles, before its page arrives. Flight durations are fixed by distance (`ui/map/motion.ts`): 0.55–0.85 s eases for nearby steps, 1–1.6 s flights otherwise. New markers fade in once the camera settles, and removed ones fade out.
- A region page keeps its country's framing and zooms half a step in about the region (`ui/map/camera.ts`), so the region stays where it was on the country view and a step to a sibling region is a short nudge. The country keeps a softer tint there, so it stays apart from curated neighbours. A large country zooms further, to zoom 4, but never more than one step past its fit, so a phone still shows its outline. A region outside the part of the country the country view fits (the Canary Islands for Spain, the Galápagos for Ecuador) is off-frame on that view, so its page centres on it instead.
- Map taps keep the map where it is. On phones a map tap first scrolls the map up to the top of the screen (while the camera moves), and the frame then stays put when the page arrives; scrolling you do while it loads is kept. On wide screens the panel scrolls to the new heading while the sticky map stays put. Panel links bring the new heading into view the same way.
- Focus after a link or map click moves to the new page's heading, unless a map marker that exists on both pages has it, in which case that marker keeps it. Any other client-side arrival (an "Explore …" link on a bean page) also focuses the heading when it is on screen. Back and Forward return focus to what you followed from that visit of the page (kept per history entry): the very link, even when the breadcrumb and a "Back to …" link share its address, or the map marker you activated with the keyboard. After a mouse or touch map click, or nothing followed, focus is left alone. The browser restores the scroll position, and Back outranks a link to the same page that was still loading. A hard load leaves focus to the browser.
- List rows highlight their map marker on mouse hover and keyboard focus; on touch screens a scroll that starts on a row doesn't.
- The world globe turns toward where curated places sit nearest its center (with the preview data: East Africa and Yemen). Zooming back out from a country keeps that country in view.

## Tests

`npm run check`. `tests/unit/map-experience-*.test.ts`: `view` (catalog-view and map-model), `mapview` (what the map draws for a focus, and its layer style), `geometry` (geometry, region framing and marker labels), `links` (including `focusFromPath` and `mapKey`), `motion` (flight timing), `arrival` (scroll on arrival and intent matching), `loader`, `preview` (preview data rules, deleted with the preview) and `screens` (server-rendered states).

The map itself (keep-alive, marker diffing, intents, focus) runs only in a browser. Manual checks, with Playwright or by hand on `npm run dev` with preview data:

- The walk `/explore` → Ethiopia marker → Harar marker → Sidama list link → bean card → Back ×3 keeps one canvas and at most 2 WebGL contexts (map plus support probe), and never shows the map's loading state again.
- At 390×844 (touch), starting at the top of the page: after each marker tap the map frame's top is 12px (±2px) from the top of the screen, and it never jumps past that spot when the page arrives.
- Enter on a region marker keeps focus on it; Enter on a list link focuses the new `h1`; Enter on a bean card, then Back, focuses that card again. Enter on a region page's "Back to …" link, then Back, focuses that link, not the breadcrumb. Enter on a region marker, Tab into the new panel, then Back, focuses the marker again.
- Reduced motion: no flights and no fades.
- With WebGL off the notice shows and the lists still navigate.
- After `npm run build` (production only): hovering a marker or list row fully prefetches the page so the click is instant; a bean card click shows the detail skeleton at once; DevTools shows one request for `/map/countries.geojson`.
