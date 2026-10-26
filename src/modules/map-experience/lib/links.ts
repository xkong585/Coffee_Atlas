import { stableIdSchema } from "@/contracts";
import type { MapFocus } from "./map-model";

/** Route builders for exploration and detail pages. IDs are encoded, never interpreted. */

const encode = (id: string) => encodeURIComponent(id);

export function explorePath(countryId?: string | null, regionId?: string | null): string {
  if (!countryId) return "/explore";
  if (!regionId) return `/explore/${encode(countryId)}`;
  return `/explore/${encode(countryId)}/${encode(regionId)}`;
}

const isStableId = (id: string) => stableIdSchema.safeParse(id).success;

/**
 * The map marker key for a place (MarkerSpec.key in ui/map/view.ts). Panel
 * links carry it as `data-map-key`, so hovering a row highlights its marker.
 */
export function mapKey(countryId: string, regionId?: string | null): string {
  return regionId ? `region:${countryId}/${regionId}` : `country:${countryId}`;
}

/**
 * The map focus an exploration pathname points at: the inverse of
 * `explorePath`. Accepts `/explore`, `/explore/{country}` and
 * `/explore/{country}/{region}` (a trailing slash is fine); anything else,
 * including IDs that are not stable IDs once decoded, gives null.
 */
export function focusFromPath(pathname: string): MapFocus | null {
  const trimmed = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const [leading, root, ...segments] = trimmed.split("/");
  if (leading !== "" || root !== "explore" || segments.length > 2) return null;
  let ids: string[];
  try {
    ids = segments.map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
  if (!ids.every(isStableId)) return null;
  const [countryId, regionId] = ids;
  if (!countryId) return { level: "world" };
  if (!regionId) return { level: "country", countryId };
  return { level: "region", countryId, regionId };
}

export const beanPath = (beanId: string) => `/beans/${encode(beanId)}`;
export const drinkPath = (drinkId: string) => `/drinks/${encode(drinkId)}`;

export interface RecommendationLinkInput {
  type: "bean" | "drink" | "both";
  scope: "global" | "selected";
  countryId?: string | null;
  regionId?: string | null;
  beanId?: string | null;
  drinkId?: string | null;
}

const validId = (value: string | null | undefined): string | undefined =>
  value && isStableId(value) ? value : undefined;

/**
 * Deep link into /recommendations using the page query names documented in
 * docs/CONTRACTS.md. Invalid IDs are dropped, a region is only kept with its
 * country, a selected scope without a country falls back to global, and at
 * most one starting item is passed (a bean wins over a drink).
 */
export function recommendationHref(input: RecommendationLinkInput): string {
  const params = new URLSearchParams();
  const countryId = validId(input.countryId);
  const regionId = countryId ? validId(input.regionId) : undefined;
  const beanId = validId(input.beanId);
  const drinkId = beanId ? undefined : validId(input.drinkId);
  const scope = input.scope === "selected" && countryId ? "selected" : "global";

  params.set("type", input.type);
  params.set("scope", scope);
  if (countryId) params.set("countryId", countryId);
  if (regionId) params.set("regionId", regionId);
  if (beanId) params.set("beanId", beanId);
  if (drinkId) params.set("drinkId", drinkId);
  return `/recommendations?${params.toString()}`;
}
