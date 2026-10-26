import type { CatalogFilter, CatalogSnapshot, LocationReference } from "@/contracts";

/**
 * A snapshot narrowed to one country or region, or null when that place is not
 * in the catalog (or the region is not in the country).
 *
 * - Beans: grown in the place. A region filter keeps only beans recorded for
 *   that region; a country-level bean is not claimed for any one region.
 * - Drinks: associated with the place. A country-level association covers its
 *   regions.
 * - Pairings: only those whose bean and drink are both returned.
 * - Countries, regions and sources: the filtered place, its regions, and every
 *   record the returned content references, so it can be read on its own.
 */
export function filterCatalog(snapshot: CatalogSnapshot, filter: CatalogFilter): CatalogSnapshot | null {
  const { countryId, regionId } = filter;
  if (!countryId) return snapshot;
  if (!snapshot.countries.some((country) => country.id === countryId)) return null;
  if (regionId && !snapshot.regions.some((region) => region.id === regionId && region.countryId === countryId)) return null;

  const grownHere = (origin: LocationReference) =>
    origin.countryId === countryId && (!regionId || origin.regionId === regionId);
  const associatedHere = (location: LocationReference) =>
    location.countryId === countryId && (!regionId || location.regionId === null || location.regionId === regionId);

  const beans = snapshot.beans.filter((bean) => grownHere(bean.origin));
  const drinks = snapshot.drinks.filter((drink) => drink.associatedLocations.some(associatedHere));
  const beanIds = new Set(beans.map((bean) => bean.id));
  const drinkIds = new Set(drinks.map((drink) => drink.id));
  const pairings = snapshot.pairings.filter((pairing) => beanIds.has(pairing.beanId) && drinkIds.has(pairing.drinkId));

  const locations: LocationReference[] = [
    { countryId, regionId: regionId ?? null },
    ...beans.map((bean) => bean.origin),
    ...drinks.flatMap((drink) => drink.associatedLocations),
  ];
  const countryIds = new Set(locations.map((location) => location.countryId));
  const regionIds = new Set(locations.flatMap((location) => (location.regionId ? [location.regionId] : [])));
  const regions = snapshot.regions.filter((region) => regionIds.has(region.id) || (!regionId && region.countryId === countryId));
  const countries = snapshot.countries.filter((country) => countryIds.has(country.id));

  const sourceIds = new Set(
    [...countries, ...regions, ...beans, ...drinks, ...pairings].flatMap((record) => record.sourceIds),
  );
  const sources = snapshot.sources.filter((source) => sourceIds.has(source.id));
  return { countries, regions, beans, drinks, pairings, sources };
}
