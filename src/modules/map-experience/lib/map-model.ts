import type { Coordinates } from "@/contracts";
import { type CatalogIndex, countrySummaries, hasCoordinates, regionSummaries } from "./catalog-view";

/**
 * Serializable data handed from server pages to the client map. It contains
 * only what the map draws (names, centers, counts), not full catalog records.
 */

export interface MapCountry {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2, used to match the country's outline. Null means list-only. */
  isoCode: string | null;
  /** Null when the catalog has no coordinates: no marker, no automatic zoom. */
  center: Coordinates | null;
  regionCount: number;
  beanCount: number;
  drinkCount: number;
}

export interface MapRegion {
  id: string;
  countryId: string;
  name: string;
  center: Coordinates | null;
  beanCount: number;
  drinkCount: number;
}

export type MapFocus =
  | { level: "world" }
  | { level: "country"; countryId: string }
  | { level: "region"; countryId: string; regionId: string };

export interface ExploreMapProps {
  countries: MapCountry[];
  /**
   * Regions the map may show; it keeps those of the focused country. The world
   * page passes all of them, so a click can show the target country's regions
   * before its page arrives.
   */
  regions: MapRegion[];
  focus: MapFocus;
  /** Accessible name for the map region. */
  label: string;
}

export function toMapCountries(index: CatalogIndex): MapCountry[] {
  return countrySummaries(index).map(({ country, regionCount, beanCount, drinkCount }) => ({
    id: country.id,
    name: country.name,
    isoCode: country.isoCode,
    center: hasCoordinates(country.center) ? country.center : null,
    regionCount,
    beanCount,
    drinkCount,
  }));
}

export function toMapRegions(index: CatalogIndex, countryId: string): MapRegion[] {
  return regionSummaries(index, countryId).map(({ region, beanCount, drinkCount }) => ({
    id: region.id,
    countryId: region.countryId,
    name: region.name,
    center: hasCoordinates(region.center) ? region.center : null,
    beanCount,
    drinkCount,
  }));
}
