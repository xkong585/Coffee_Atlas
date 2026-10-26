import type { CatalogSnapshot } from "@/contracts";
import { itemKey } from "./candidates";

/**
 * The plain names and links the recommendation screen needs to display
 * results. The API returns stable IDs only, so the server page builds this
 * from the same catalog snapshot and passes it to the client form.
 */
export interface RecommendationLookup {
  items: Record<string, { name: string; href: string; place: string | null }>;
  sources: Record<string, { title: string; url: string; publisher: string | null }>;
  countries: { id: string; name: string; regions: { id: string; name: string }[] }[];
}

export function buildLookup(snapshot: CatalogSnapshot): RecommendationLookup {
  const countryName = new Map(snapshot.countries.map((country) => [country.id, country.name]));
  const regionName = new Map(snapshot.regions.map((region) => [region.id, region.name]));
  const place = (countryId: string, regionId: string | null) => {
    const country = countryName.get(countryId) ?? null;
    const region = regionId ? regionName.get(regionId) ?? null : null;
    return region && country ? `${region}, ${country}` : country;
  };

  const items: RecommendationLookup["items"] = {};
  for (const bean of snapshot.beans) {
    items[itemKey({ itemType: "bean", itemId: bean.id })] = {
      name: bean.name,
      href: `/beans/${encodeURIComponent(bean.id)}`,
      place: place(bean.origin.countryId, bean.origin.regionId),
    };
  }
  for (const drink of snapshot.drinks) {
    const first = drink.associatedLocations[0];
    items[itemKey({ itemType: "drink", itemId: drink.id })] = {
      name: drink.name,
      href: `/drinks/${encodeURIComponent(drink.id)}`,
      place: first ? place(first.countryId, first.regionId) : null,
    };
  }

  return {
    items,
    sources: Object.fromEntries(snapshot.sources.map((source) =>
      [source.id, { title: source.title, url: source.url, publisher: source.publisher }])),
    countries: snapshot.countries.map((country) => ({
      id: country.id,
      name: country.name,
      regions: snapshot.regions
        .filter((region) => region.countryId === country.id)
        .map((region) => ({ id: region.id, name: region.name })),
    })),
  };
}
