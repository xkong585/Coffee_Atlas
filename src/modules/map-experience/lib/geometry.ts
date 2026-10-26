/**
 * Pure geometry helpers for the exploration map. They work on the bundled
 * Natural Earth admin-0 outlines (`public/map/countries.geojson`, properties
 * `iso` and `name`) and never touch the DOM or the map library, so they can be
 * unit tested in Node.
 *
 * Longitudes are in degrees. A bounds value is `[[west, south], [east, north]]`
 * where `east` may be greater than 180 when the outline crosses the
 * antimeridian (for example Russia, Fiji or New Zealand). MapLibre accepts that
 * form and fits the shorter way around the globe.
 */

export type LngLatTuple = [longitude: number, latitude: number];
export type Bounds = [southWest: LngLatTuple, northEast: LngLatTuple];

type Position = number[];
type Ring = Position[];

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: Ring[];
}

export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: Ring[][];
}

export interface CountryFeature {
  type: "Feature";
  properties: { iso?: unknown; name?: unknown } | null;
  geometry: PolygonGeometry | MultiPolygonGeometry | { type: string } | null;
}

export interface CountryCollection {
  type: "FeatureCollection";
  features: CountryFeature[];
}

export interface Extent {
  west: number;
  east: number;
  south: number;
  north: number;
}

interface PolygonExtent extends Extent {
  area: number;
}

/** Web Mercator cannot show the poles, so fitted bounds stay inside this latitude. */
const MAX_LATITUDE = 85;

/** Minimal shape check for the fetched outline file; it is static, but a bad deploy must not crash the map. */
export function isCountryCollection(value: unknown): value is CountryCollection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; features?: unknown };
  return candidate.type === "FeatureCollection" && Array.isArray(candidate.features);
}

/**
 * Normalizes an ISO 3166-1 alpha-2 code. Natural Earth uses `-99` for a few
 * disputed areas; those (and anything that is not two letters) match nothing.
 */
export function normalizeIso(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const iso = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(iso) ? iso : null;
}

/** All outline features for one country. Some countries are split across several features. */
export function featuresForIso(collection: CountryCollection, code: string | null | undefined): CountryFeature[] {
  const iso = normalizeIso(code);
  if (!iso) return [];
  return collection.features.filter((feature) => normalizeIso(feature.properties?.iso) === iso);
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Outer rings of a polygon or multipolygon geometry. Holes never change a bounding box. */
function outerRings(geometry: CountryFeature["geometry"]): Ring[] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    const ring = (geometry as PolygonGeometry).coordinates?.[0];
    return Array.isArray(ring) ? [ring] : [];
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = (geometry as MultiPolygonGeometry).coordinates;
    if (!Array.isArray(polygons)) return [];
    return polygons.map((polygon) => polygon?.[0]).filter((ring): ring is Ring => Array.isArray(ring));
  }
  return [];
}

/** Extent and approximate area (degrees², scaled by latitude) of one ring; null when it has no valid points. */
export function ringExtent(ring: Ring): (Extent & { area: number }) | null {
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let twiceArea = 0;
  let previous: Position | null = null;
  for (const point of ring) {
    const [lng, lat] = point ?? [];
    if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) continue;
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    if (previous) twiceArea += previous[0] * lat - lng * previous[1];
    previous = point;
  }
  if (!Number.isFinite(west)) return null;
  const midLatitude = ((south + north) / 2) * (Math.PI / 180);
  return { west, east, south, north, area: Math.abs(twiceArea / 2) * Math.cos(midLatitude) };
}

/** Extents of every polygon part (outer ring) of the given features. */
export function polygonExtents(features: readonly CountryFeature[]): PolygonExtent[] {
  const extents: PolygonExtent[] = [];
  for (const feature of features) {
    for (const ring of outerRings(feature.geometry)) {
      const extent = ringExtent(ring);
      if (extent) extents.push(extent);
    }
  }
  return extents;
}

/** Gap in degrees between two longitude intervals (0 when they overlap). */
const lngGap = (a: Extent, west: number, east: number) => Math.max(0, west - a.east, a.west - east);
const latGap = (a: Extent, b: Extent) => Math.max(0, b.south - a.north, a.south - b.north);

/**
 * Bounds of the main body of a country: starts from its largest polygon and
 * adds every part within reach of what has been gathered so far (reach grows
 * with the cluster, at least 4°). Nearby islands join (Corsica, Hokkaido,
 * Zanzibar, the rest of Indonesia), while far overseas territories that would
 * shrink the country to a dot are left out (French Guiana for France, the
 * Galápagos for Ecuador, the Canary Islands for Spain). Each part may be
 * shifted by ±360° so countries that cross the antimeridian stay contiguous.
 */
export function clusterBounds(extents: readonly PolygonExtent[]): Bounds | null {
  if (extents.length === 0) return null;
  const remaining = [...extents].sort((a, b) => b.area - a.area);
  const seed = remaining.shift() as PolygonExtent;
  const cluster: Extent = { west: seed.west, east: seed.east, south: seed.south, north: seed.north };

  let added = true;
  while (added && remaining.length > 0) {
    added = false;
    const reach = Math.max(4, 0.5 * Math.max(cluster.east - cluster.west, cluster.north - cluster.south));
    for (let index = 0; index < remaining.length; index += 1) {
      const part = remaining[index];
      let bestShift = 0;
      let bestGap = Number.POSITIVE_INFINITY;
      for (const shift of [0, -360, 360]) {
        const gap = lngGap(cluster, part.west + shift, part.east + shift);
        if (gap < bestGap) {
          bestGap = gap;
          bestShift = shift;
        }
      }
      if (Math.hypot(bestGap, latGap(cluster, part)) > reach) continue;
      cluster.west = Math.min(cluster.west, part.west + bestShift);
      cluster.east = Math.max(cluster.east, part.east + bestShift);
      cluster.south = Math.min(cluster.south, part.south);
      cluster.north = Math.max(cluster.north, part.north);
      remaining.splice(index, 1);
      index -= 1;
      added = true;
    }
  }

  // Keep the center of the box inside [-180, 180] and never span more than the whole globe.
  let { west, east } = cluster;
  if (east - west >= 360) {
    west = -180;
    east = 180;
  } else {
    const shift = Math.round((west + east) / 2 / 360) * 360;
    west -= shift;
    east -= shift;
  }
  const south = Math.max(-MAX_LATITUDE, cluster.south);
  const north = Math.min(MAX_LATITUDE, cluster.north);
  return [
    [west, Math.min(south, north)],
    [east, Math.max(south, north)],
  ];
}

/** Bounds to fit for a country's outline, matched by ISO code. Null when the outline is unknown. */
export function countryBounds(collection: CountryCollection, code: string | null | undefined): Bounds | null {
  return clusterBounds(polygonExtents(featuresForIso(collection, code)));
}

/** Wraps a longitude into [-180, 180). */
export function normalizeLongitude(lng: number): number {
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/** Center of a bounds value with its longitude wrapped into [-180, 180). */
export function boundsCenter([[west, south], [east, north]]: Bounds): LngLatTuple {
  return [normalizeLongitude((west + east) / 2), (south + north) / 2];
}

/**
 * Smallest longitude arc containing all the given longitudes, found by
 * removing the largest empty gap around the circle. Returns `[west, east]`
 * with `east` possibly above 180, or null for no input.
 */
export function longitudeArc(longitudes: readonly number[]): [west: number, east: number] | null {
  const sorted = longitudes.filter(isFiniteNumber).map(normalizeLongitude).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  let gapStart = sorted.length - 1;
  let largestGap = sorted[0] + 360 - sorted[sorted.length - 1];
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = sorted[index] - sorted[index - 1];
    if (gap > largestGap) {
      largestGap = gap;
      gapStart = index - 1;
    }
  }
  const west = sorted[(gapStart + 1) % sorted.length];
  const east = sorted[gapStart];
  return [west, east >= west ? east : east + 360];
}

export const DEFAULT_WORLD_CENTER: LngLatTuple = [15, 10];

/** The world globe looks at latitudes within this range, so the coffee belt stays in the middle. */
export const WORLD_LATITUDE_RANGE = [-20, 30] as const;

/** Share of the frame's shorter side the world globe fills (also the loading disc in explore-map.module.css). */
export const GLOBE_FILL = 0.8;

const WORLD_CENTER_STEP = 5;

export const clampWorldLatitude = (latitude: number) =>
  Math.min(WORLD_LATITUDE_RANGE[1], Math.max(WORLD_LATITUDE_RANGE[0], latitude));

const worldLatitude = (points: readonly LngLatTuple[]) =>
  clampWorldLatitude(points.reduce((sum, [, lat]) => sum + lat, 0) / points.length);

/** Great-circle angle between two points, in degrees. */
export function angularDistance([lng1, lat1]: LngLatTuple, [lng2, lat2]: LngLatTuple): number {
  const rad = Math.PI / 180;
  const cosine =
    Math.sin(lat1 * rad) * Math.sin(lat2 * rad) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) / rad;
}

/**
 * Where the world-level globe looks. When every curated place sits within one
 * visible hemisphere (an arc of at most `maxArc` degrees) the globe turns to
 * face them. Otherwise it turns to the longitude where they read best: each
 * place counts by the cosine of its angle from the center, fully in the
 * middle, less toward the rim (where markers foreshorten and MapLibre may
 * treat them as covered) and not at all behind the globe. So a group near the
 * middle beats a ring of places on the edge. Ties go to the longitude closest
 * to all places. Places left behind the globe are a drag away and always in
 * the page's list.
 */
export function worldViewCenter(points: readonly LngLatTuple[], maxArc = 140): LngLatTuple {
  const valid = points.filter(([lng, lat]) => isFiniteNumber(lng) && isFiniteNumber(lat));
  const arc = longitudeArc(valid.map(([lng]) => lng));
  if (!arc) return DEFAULT_WORLD_CENTER;
  const latitude = worldLatitude(valid);
  if (arc[1] - arc[0] <= maxArc) return [normalizeLongitude((arc[0] + arc[1]) / 2), latitude];

  const rad = Math.PI / 180;
  const score = (center: LngLatTuple) => {
    const distances = valid.map((point) => angularDistance(center, point));
    return {
      legibility: distances.reduce((sum, distance) => sum + Math.max(0, Math.cos(distance * rad)), 0),
      spread: distances.reduce((sum, distance) => sum + distance, 0),
    };
  };
  let best: LngLatTuple = [-180, latitude];
  let bestScore = score(best);
  for (let lng = -180 + WORLD_CENTER_STEP; lng < 180; lng += WORLD_CENTER_STEP) {
    const center: LngLatTuple = [lng, latitude];
    const candidate = score(center);
    if (
      candidate.legibility > bestScore.legibility + 1e-9 ||
      (candidate.legibility > bestScore.legibility - 1e-9 && candidate.spread < bestScore.spread - 1e-6)
    ) {
      best = center;
      bestScore = candidate;
    }
  }
  return best;
}

/**
 * Zoom at which the globe's visible disc fills about `fill` of the smaller
 * side of a viewport. MapLibre draws the globe with a radius of
 * 512·2^zoom / (2π·cos latitude) pixels, seen by a perspective camera
 * 1.5 × the viewport height away (its default 36.87° field of view), so the
 * disc on screen is a little smaller than that radius.
 */
export function globeZoomFor(width: number, height: number, fill = GLOBE_FILL, latitude = 0): number {
  const side = Math.min(width, height);
  if (!isFiniteNumber(side) || !isFiniteNumber(height) || side <= 0) return 1.3;
  const cameraDistance = 1.5 * height;
  const discRadius = (side * fill) / 2;
  const tangent = discRadius / cameraDistance;
  const sine = tangent / Math.sqrt(1 + tangent * tangent);
  const globeRadius = (cameraDistance * sine) / (1 - sine);
  const latitudeScale = Math.cos((Math.min(80, Math.abs(isFiniteNumber(latitude) ? latitude : 0)) * Math.PI) / 180);
  const zoom = Math.log2((globeRadius * 2 * Math.PI * latitudeScale) / 512);
  return Math.min(2.6, Math.max(0.2, zoom));
}

const MAX_MERCATOR_LATITUDE = 85.051129;

/** Web Mercator x/y in [0, 1] (y grows southward), as MapLibre's MercatorCoordinate. */
function toMercator([lng, lat]: LngLatTuple): [x: number, y: number] {
  const clamped = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, lat));
  const sine = Math.sin((clamped * Math.PI) / 180);
  return [(lng + 180) / 360, 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)];
}

function fromMercator([x, y]: [number, number]): LngLatTuple {
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [normalizeLongitude(x * 360 - 180), lat];
}

/**
 * The center that keeps `anchor` at the same screen position when the camera
 * at `center` zooms in by `step`: in Web Mercator, C' = A + (C − A)·2^−step.
 * The longitude difference is taken the short way round, so it works across
 * the antimeridian. Pure, so it can be unit tested.
 */
export function anchoredCenter(center: LngLatTuple, anchor: LngLatTuple, step: number): LngLatTuple {
  if (!Number.isFinite(step)) return center;
  const [ax, ay] = toMercator(anchor);
  const [cx0, cy] = toMercator(center);
  // Bring the center within half a world of the anchor.
  const cx = ax + normalizeLongitude((cx0 - ax) * 360) / 360;
  const scale = 2 ** -step;
  return fromMercator([ax + (cx - ax) * scale, ay + (cy - ay) * scale]);
}

/**
 * Whether a point lies inside a bounds value (whose east may exceed 180), within
 * `margin` degrees. Longitudes are compared round the globe, so a box across the
 * antimeridian contains points on both sides of it.
 */
export function boundsContain([[west, south], [east, north]]: Bounds, [lng, lat]: LngLatTuple, margin = 0): boolean {
  if (lat < south - margin || lat > north + margin) return false;
  const offset = (((lng - west + margin) % 360) + 360) % 360;
  return offset <= east - west + 2 * margin;
}
