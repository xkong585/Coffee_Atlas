import type { CatalogSnapshot, Coordinates } from "@/contracts";
import { beanPath, drinkPath, explorePath } from "@/modules/map-experience/lib/links";
import { itemKey, placeKey } from "./destinations";

/**
 * Plain names, links and map positions the trip page needs. The API returns
 * catalog IDs only, so the server page builds this from the same snapshot and
 * passes it to the client.
 */
export interface TripPlace {
  name: string;
  countryName: string;
  href: string;
  /** ISO code of the country outline, for tinting it on the globe. */
  iso: string | null;
  /** Where the stop's pin goes; null keeps the stop list-only (never (0, 0)). */
  center: Coordinates | null;
  /** True when a region has no center of its own and the pin uses its country's. */
  approximate: boolean;
}

export interface TripLookup {
  places: Record<string, TripPlace>;
  items: Record<string, { name: string; href: string; kind: "Coffee bean" | "Regional drink" }>;
  sources: Record<string, { title: string; url: string; publisher: string | null }>;
}

const validCenter = (center: Coordinates | null | undefined): Coordinates | null =>
  center && Number.isFinite(center.latitude) && Number.isFinite(center.longitude) ? center : null;

export function buildTripLookup(snapshot: CatalogSnapshot): TripLookup {
  const places: TripLookup["places"] = {};
  for (const country of snapshot.countries) {
    places[placeKey(country.id, null)] = {
      name: country.name,
      countryName: country.name,
      href: explorePath(country.id),
      iso: country.isoCode,
      center: validCenter(country.center),
      approximate: false,
    };
  }
  for (const region of snapshot.regions) {
    const country = snapshot.countries.find((entry) => entry.id === region.countryId);
    if (!country) continue;
    const own = validCenter(region.center);
    const fallback = validCenter(country.center);
    places[placeKey(country.id, region.id)] = {
      name: region.name,
      countryName: country.name,
      href: explorePath(country.id, region.id),
      iso: country.isoCode,
      center: own ?? fallback,
      approximate: !own && Boolean(fallback),
    };
  }

  const items: TripLookup["items"] = {};
  for (const bean of snapshot.beans) {
    items[itemKey({ itemType: "bean", itemId: bean.id })] = { name: bean.name, href: beanPath(bean.id), kind: "Coffee bean" };
  }
  for (const drink of snapshot.drinks) {
    items[itemKey({ itemType: "drink", itemId: drink.id })] = { name: drink.name, href: drinkPath(drink.id), kind: "Regional drink" };
  }

  return {
    places,
    items,
    sources: Object.fromEntries(snapshot.sources.map((source) =>
      [source.id, { title: source.title, url: source.url, publisher: source.publisher }])),
  };
}
