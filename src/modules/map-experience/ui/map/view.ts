import type { Coordinates } from "@/contracts";
import { type LngLatTuple, normalizeIso, normalizeLongitude } from "@/modules/map-experience/lib/geometry";
import { explorePath, mapKey } from "@/modules/map-experience/lib/links";
import type { MapCountry, MapFocus, MapRegion } from "@/modules/map-experience/lib/map-model";
import { countsLabel, markerAriaLabel, markerDiameter } from "./labels";
import { type Landmark, landmarkFor } from "./landmarks";

/**
 * Everything the map draws for one set of props, as plain serializable data.
 * Built with useMemo in the component. Markers are diffed by MarkerSpec.key
 * (markers.ts syncMarkers), and the layers only change when their ISO codes
 * or opacities do (style.ts applyViewToLayers).
 */

export interface MarkerSpec {
  key: string;
  kind: "country" | "region";
  href: string;
  name: string;
  /** "3 regions · 3 beans · 2 drinks" */
  detail: string;
  ariaLabel: string;
  lngLat: LngLatTuple;
  /** Visible dot size in pixels. */
  diameter: number;
  selected: boolean;
  /** Outline highlighted while the marker is hovered or focused. */
  iso: string | null;
  /** Side of the dot the name sits on; null for country markers, which carry no name on the map. */
  labelSide: "left" | "right" | null;
  /** Landmark illustration standing on the dot (map/landmarks.ts). */
  landmark: Landmark | null;
}

export interface CuratedOutline {
  iso: string;
  countryId: string;
  name: string;
  detail: string;
  href: string;
}

export type CameraIntent =
  | { kind: "world" }
  | { kind: "country"; iso: string | null; center: LngLatTuple | null }
  | { kind: "region"; center: LngLatTuple | null; iso: string | null; countryCenter: LngLatTuple | null };

export interface MapView {
  level: MapFocus["level"];
  focusKey: string;
  /** Outline of the focused country (country and region levels). */
  focusedIso: string | null;
  /** Country filled with the focus tint (country and region levels). */
  emphasizedIso: string | null;
  /** Opacity of that tint: full on a country page, softer on a region page so its markers stand out. */
  emphasisOpacity: number;
  /** Countries with curated content and a known outline, one per ISO code. */
  curated: CuratedOutline[];
  markers: MarkerSpec[];
  /** Centers of countries with content, used to turn the world globe toward them. */
  worldPoints: LngLatTuple[];
  camera: CameraIntent;
}

/** Converts a catalog center to MapLibre's [lng, lat]; null stays null (never 0,0). */
export function toLngLat(center: Coordinates | null | undefined): LngLatTuple | null {
  if (!center) return null;
  const { latitude, longitude } = center;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return [longitude, latitude];
}

export function focusKeyOf(focus: MapFocus): string {
  if (focus.level === "world") return "world";
  return mapKey(focus.countryId, focus.level === "region" ? focus.regionId : null);
}

/** The focus tint on a region page: the country stays apart from its neighbours, the region markers lead. */
const REGION_EMPHASIS_OPACITY = 0.45;

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** About one region name's width and height at region zoom (roughly 45 px per degree), in degrees. */
const LABEL_CLEARANCE_LNG = 1.5;
const LABEL_CLEARANCE_LAT = 1.2;

/**
 * Region names sit right of their dot, or left when another region lies just
 * east of it (as Sidama does for Yirgacheffe), so the two names never overlap.
 * Degrees rather than pixels: region views share a narrow zoom range.
 */
function regionLabelSide(lngLat: LngLatTuple, others: readonly LngLatTuple[]): "left" | "right" {
  const crowded = others.some(([lng, lat]) => {
    const east = normalizeLongitude(lng - lngLat[0]);
    return east > 0 && east < LABEL_CLEARANCE_LNG && Math.abs(lat - lngLat[1]) < LABEL_CLEARANCE_LAT;
  });
  return crowded ? "left" : "right";
}

export function buildMapView(countries: readonly MapCountry[], regions: readonly MapRegion[], focus: MapFocus): MapView {
  const focusedCountry = focus.level === "world" ? null : (countries.find((country) => country.id === focus.countryId) ?? null);
  const focusedIso = normalizeIso(focusedCountry?.isoCode);

  const curated: CuratedOutline[] = [];
  const seenIso = new Set<string>();
  for (const country of [...countries].sort(byName)) {
    const iso = normalizeIso(country.isoCode);
    if (!iso || seenIso.has(iso)) continue;
    seenIso.add(iso);
    curated.push({
      iso,
      countryId: country.id,
      name: country.name,
      detail: countsLabel(country).join(" · "),
      href: explorePath(country.id),
    });
  }

  const worldPoints = countries.map((country) => toLngLat(country.center)).filter((point): point is LngLatTuple => point !== null);

  const markers: MarkerSpec[] = [];
  if (focus.level === "world") {
    for (const country of [...countries].sort(byName)) {
      const lngLat = toLngLat(country.center);
      if (!lngLat) continue;
      const iso = normalizeIso(country.isoCode);
      const landmark = landmarkFor(iso);
      markers.push({
        key: mapKey(country.id),
        kind: "country",
        href: explorePath(country.id),
        name: country.name,
        detail: countsLabel(country).join(" · "),
        ariaLabel: markerAriaLabel(country.name, country),
        lngLat,
        diameter: markerDiameter(country.regionCount + country.beanCount + country.drinkCount),
        selected: false,
        iso,
        labelSide: null,
        landmark,
      });
    }
  } else {
    const selectedRegionId = focus.level === "region" ? focus.regionId : null;
    const placed = [...regions]
      .sort(byName)
      .filter((region) => region.countryId === focus.countryId)
      .map((region) => ({ region, lngLat: toLngLat(region.center) }))
      .filter((entry): entry is { region: MapRegion; lngLat: LngLatTuple } => entry.lngLat !== null);
    const points = placed.map((entry) => entry.lngLat);
    for (const { region, lngLat } of placed) {
      const counts = { beanCount: region.beanCount, drinkCount: region.drinkCount };
      const selected = region.id === selectedRegionId;
      markers.push({
        key: mapKey(region.countryId, region.id),
        kind: "region",
        href: explorePath(region.countryId, region.id),
        name: region.name,
        detail: countsLabel(counts).join(" · "),
        ariaLabel: markerAriaLabel(region.name, counts, focusedCountry?.name),
        lngLat,
        diameter: markerDiameter(region.beanCount + region.drinkCount) + (selected ? 4 : 0),
        selected,
        iso: null,
        labelSide: regionLabelSide(lngLat, points),
        landmark: landmarkFor(focusedIso, region.id),
      });
    }
  }

  let camera: CameraIntent;
  if (focus.level === "world") {
    camera = { kind: "world" };
  } else if (focus.level === "country") {
    camera = { kind: "country", iso: focusedIso, center: toLngLat(focusedCountry?.center) };
  } else {
    const region = regions.find((candidate) => candidate.id === focus.regionId && candidate.countryId === focus.countryId);
    camera = { kind: "region", center: toLngLat(region?.center), iso: focusedIso, countryCenter: toLngLat(focusedCountry?.center) };
  }

  return {
    level: focus.level,
    focusKey: focusKeyOf(focus),
    focusedIso,
    emphasizedIso: focusedIso,
    emphasisOpacity: focus.level === "region" ? REGION_EMPHASIS_OPACITY : 1,
    curated,
    markers,
    worldPoints,
    camera,
  };
}
