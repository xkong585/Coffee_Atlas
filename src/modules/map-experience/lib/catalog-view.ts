import type {
  Bean,
  CatalogSnapshot,
  Coordinates,
  Country,
  Drink,
  Pairing,
  Region,
  Source,
} from "@/contracts";

/**
 * Pure, framework-free views over a catalog snapshot. Everything the map and
 * detail screens show is derived here so it can be unit tested without React.
 * The snapshot itself always comes from the shared catalog contract; this
 * module never holds coffee content of its own.
 */

export interface CatalogIndex {
  snapshot: CatalogSnapshot;
  countries: Map<string, Country>;
  regions: Map<string, Region>;
  beans: Map<string, Bean>;
  drinks: Map<string, Drink>;
  sources: Map<string, Source>;
}

export interface LocationFilter {
  countryId: string;
  regionId?: string | null;
}

export interface CountrySummary {
  country: Country;
  regionCount: number;
  beanCount: number;
  drinkCount: number;
}

export interface RegionSummary {
  region: Region;
  beanCount: number;
  drinkCount: number;
}

export interface PairingView {
  pairing: Pairing;
  /** The other side of the pairing; null when the snapshot does not contain it. */
  bean: Bean | null;
  drink: Drink | null;
}

export interface PairingGroups {
  documented: PairingView[];
  suggested: PairingView[];
}

export interface SourceLookup {
  found: Source[];
  missingIds: string[];
}

const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

function mapById<T extends { id: string }>(records: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  // First record wins so a duplicated ID cannot silently replace earlier content.
  for (const record of records) if (!map.has(record.id)) map.set(record.id, record);
  return map;
}

export function indexCatalog(snapshot: CatalogSnapshot): CatalogIndex {
  return {
    snapshot,
    countries: mapById(snapshot.countries),
    regions: mapById(snapshot.regions),
    beans: mapById(snapshot.beans),
    drinks: mapById(snapshot.drinks),
    sources: mapById(snapshot.sources),
  };
}

/** True only for finite, in-range coordinates. Missing centers are never treated as (0, 0). */
export function hasCoordinates(center: Coordinates | null | undefined): center is Coordinates {
  return Boolean(
    center &&
      Number.isFinite(center.latitude) &&
      Number.isFinite(center.longitude) &&
      center.latitude >= -90 &&
      center.latitude <= 90 &&
      center.longitude >= -180 &&
      center.longitude <= 180,
  );
}

export function regionsOf(index: CatalogIndex, countryId: string): Region[] {
  return index.snapshot.regions.filter((region) => region.countryId === countryId).sort(byName);
}

/** A region page is valid only when the region exists and its parent is the requested country. */
export function regionBelongsToCountry(index: CatalogIndex, countryId: string, regionId: string): boolean {
  const region = index.regions.get(regionId);
  return Boolean(region && region.countryId === countryId && index.countries.has(countryId));
}

/**
 * Beans whose origin (where they grow) is the given location. A country-level
 * query includes beans recorded at any of its regions or at country level only.
 */
export function beansGrownIn(index: CatalogIndex, location: LocationFilter): Bean[] {
  return index.snapshot.beans
    .filter((bean) =>
      bean.origin.countryId === location.countryId &&
      (location.regionId ? bean.origin.regionId === location.regionId : true),
    )
    .sort(byName);
}

/**
 * Drinks culturally associated with a location. This is association, not bean
 * provenance. For a region, `region` holds drinks tied to that region and
 * `countryWide` holds drinks associated with the whole country (regionId null).
 */
export function drinksAssociatedWith(
  index: CatalogIndex,
  location: LocationFilter,
): { region: Drink[]; countryWide: Drink[] } {
  const inCountry = index.snapshot.drinks.filter((drink) =>
    drink.associatedLocations.some((place) => place.countryId === location.countryId),
  );
  if (!location.regionId) return { region: [], countryWide: [...inCountry].sort(byName) };
  const region = inCountry.filter((drink) =>
    drink.associatedLocations.some(
      (place) => place.countryId === location.countryId && place.regionId === location.regionId,
    ),
  );
  const regionIds = new Set(region.map((drink) => drink.id));
  const countryWide = inCountry.filter(
    (drink) =>
      !regionIds.has(drink.id) &&
      drink.associatedLocations.some((place) => place.countryId === location.countryId && place.regionId === null),
  );
  return { region: region.sort(byName), countryWide: countryWide.sort(byName) };
}

/** Every drink associated anywhere in a country (any region or country-wide). */
export function drinksInCountry(index: CatalogIndex, countryId: string): Drink[] {
  return index.snapshot.drinks
    .filter((drink) => drink.associatedLocations.some((place) => place.countryId === countryId))
    .sort(byName);
}

function groupPairings(views: PairingView[]): PairingGroups {
  return {
    documented: views.filter((view) => view.pairing.relationship === "documented"),
    suggested: views.filter((view) => view.pairing.relationship === "suggested"),
  };
}

export function pairingsForBean(index: CatalogIndex, beanId: string): PairingGroups {
  return groupPairings(
    index.snapshot.pairings
      .filter((pairing) => pairing.beanId === beanId)
      .map((pairing) => ({ pairing, bean: index.beans.get(pairing.beanId) ?? null, drink: index.drinks.get(pairing.drinkId) ?? null })),
  );
}

export function pairingsForDrink(index: CatalogIndex, drinkId: string): PairingGroups {
  return groupPairings(
    index.snapshot.pairings
      .filter((pairing) => pairing.drinkId === drinkId)
      .map((pairing) => ({ pairing, bean: index.beans.get(pairing.beanId) ?? null, drink: index.drinks.get(pairing.drinkId) ?? null })),
  );
}

/** Resolves source IDs in their given order; unknown IDs are reported rather than hidden. */
export function sourcesFor(index: CatalogIndex, ids: readonly string[]): SourceLookup {
  const found: Source[] = [];
  const missingIds: string[] = [];
  for (const id of new Set(ids)) {
    const source = index.sources.get(id);
    if (source) found.push(source);
    else missingIds.push(id);
  }
  return { found, missingIds };
}

/** Country and region records for a location reference; either may be null if absent from the snapshot. */
export function resolveLocation(
  index: CatalogIndex,
  location: { countryId: string; regionId: string | null },
): { country: Country | null; region: Region | null } {
  const country = index.countries.get(location.countryId) ?? null;
  const region = location.regionId ? index.regions.get(location.regionId) ?? null : null;
  // A region that names a different parent is not shown as part of this country.
  return { country, region: region && region.countryId === location.countryId ? region : null };
}

export function countrySummaries(index: CatalogIndex): CountrySummary[] {
  return [...index.snapshot.countries].sort(byName).map((country) => ({
    country,
    regionCount: regionsOf(index, country.id).length,
    beanCount: beansGrownIn(index, { countryId: country.id }).length,
    drinkCount: drinksInCountry(index, country.id).length,
  }));
}

export function regionSummaries(index: CatalogIndex, countryId: string): RegionSummary[] {
  return regionsOf(index, countryId).map((region) => {
    const drinks = drinksAssociatedWith(index, { countryId, regionId: region.id });
    return {
      region,
      beanCount: beansGrownIn(index, { countryId, regionId: region.id }).length,
      drinkCount: drinks.region.length,
    };
  });
}
