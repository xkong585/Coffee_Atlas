import type { Coordinates, Country, Region } from "@/contracts";
import { hasCoordinates } from "@/modules/map-experience/lib/catalog-view";
import { type ContentCounts, countsLabel } from "./map/labels";

/** Small, pure wording helpers shared by the exploration and detail screens. */

export const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

/**
 * ["3 regions", "3 beans", "2 drinks"]: zero counts are left out and an empty
 * place reads "Nothing recorded yet", exactly like the map's tooltips (one
 * implementation, map/labels.ts).
 */
export const countsParts: (counts: ContentCounts) => string[] = countsLabel;

/** "3 regions · 3 beans · 2 drinks" */
export const countsText = (counts: ContentCounts): string => countsLabel(counts).join(" · ");

/** "Yirgacheffe, Ethiopia", "Ethiopia", or null when neither record is known. */
export function placeName(country: Pick<Country, "name"> | null, region: Pick<Region, "name"> | null): string | null {
  if (region && country) return `${region.name}, ${country.name}`;
  return region?.name ?? country?.name ?? null;
}

/**
 * A country is drawn on the map when it has an outline (ISO code) or a center
 * for its marker. Without either it stays reachable through the lists only.
 */
export function countryOnMap(country: { isoCode: string | null; center: Coordinates | null }): boolean {
  return Boolean(country.isoCode) || hasCoordinates(country.center);
}

/** Regions have no outlines, so only a valid center puts them on the map. */
export function regionOnMap(region: { center: Coordinates | null }): boolean {
  return hasCoordinates(region.center);
}

const accessedFormat = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "Oct 16, 2026" for a YYYY-MM-DD value; the raw value if it cannot be read. */
export function formatAccessed(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : accessedFormat.format(parsed);
}
