# Catalog (Member 3, `codex/catalog-data`)

`services.catalog` (`server/service.ts`) serves the real catalog: 60 countries with their regions, beans, drinks, pairings and sources. Map, AI recommendations and the AI trip map all read it through that service; none keeps its own copy.

## Where the data lives

- `data/records.ts` is the catalog, versioned with the code. It started from the sourced records Member 2 compiled for the map preview. Every source link was checked on 2026-10-20; three Wikipedia pages that do not exist (coffee in Burundi, Myanmar and Nepal) were replaced by pages that do, and the affected summaries were rewritten to say only what those pages support.
- **Enrichment pass (2026-10-20):** records that cited only the generic Wikipedia "Coffee" or "Coffea canephora" articles now cite country- or place-specific pages, and claims those pages don't support were rewritten or removed. That changed some names: "Arabica" was dropped where no source says arabica, and Tenom coffee is robusta. The SAVA region of Madagascar was removed because no source places coffee there. Flavor, processing and variety details were added from Cafe Imports and Sucafina origin pages and Coffee Review origin guides, and every drink now has flavor notes from its source. Seven beans were added for major producers (Colombia, Costa Rica, Honduras, Mexico, Vietnam, Uganda, India), along with 14 suggested pairings. Totals: 60 countries, 54 regions, 61 beans, 27 drinks, 33 pairings, 135 sources, all links checked. 16 beans still have no flavor notes because no source found so far describes their cup. Those fields stay empty rather than guessed.
- **Why a file and not a database table:** the catalog is curated content that changes with reviewed pull requests, not with user actions. Keeping it in Git makes every change reviewable, needs no import step on deploy, and lets the map work even when the user database is down. The accounts database stores only references to catalog IDs.

## Checks (`npm run catalog:check`, also part of `npm test`)

`lib/integrity.ts` checks what the Zod contract cannot: duplicate IDs (per collection) and ISO codes, regions in unknown countries, bean origins and drink locations pointing at unknown places or at a region of a different country, repeated drink locations, pairings with unknown beans or drinks or a repeated bean–drink pair, unknown source IDs, and sources no record cites. The service parses and checks the records once; a catalog that fails is never served in part. Every read answers `INTERNAL_ERROR` and the problems go to the server log.

## Reads

- `list({})`: the whole snapshot. `list({ countryId, regionId? })`: a self-contained part (`lib/filter.ts`). Beans grown there (a region filter keeps only beans recorded for that region), drinks associated with it (a country-level association covers its regions), pairings whose bean and drink are both included, and every country, region and source those records reference. Unknown places, or a region outside its country, give `NOT_FOUND`.
- `getBean(id)`, `getDrink(id)`: one record or `NOT_FOUND`.
- Callers get copies, so a consumer cannot change the shared snapshot.

## Adding or changing content

1. Edit `data/records.ts`. Keep IDs stable: saved items reference them. Give each record at least one source that says what the record says, with its access date.
2. A new country needs `isoCode` equal to `iso` in `public/map/countries.geojson` and, for a landmark, a row in `map-experience/ui/map/landmarks.ts`.
3. Use `"documented"` only for pairings the cited source describes as a tradition; otherwise `"suggested"`.
4. Run `npm run catalog:check`.

The map module's `dev/preview-catalog.ts` now only gates this same data for the old development fallback. That fallback is no longer reached, because the service is never unavailable. It can be deleted together with the fallbacks in `map-experience/server/catalog-loader.ts` and `recommendations/server/catalog-source.ts`.
