import { angularDistance, GLOBE_FILL, globeZoomFor, type LngLatTuple, worldViewCenter } from "@/modules/map-experience/lib/geometry";

/**
 * Pure geometry for drawing a trip on the globe: great-circle legs between
 * consecutive stops and a camera that frames them. No MapLibre here, so it can
 * be unit tested.
 */

const RAD = Math.PI / 180;

function toVector([lng, lat]: LngLatTuple): [number, number, number] {
  return [Math.cos(lat * RAD) * Math.cos(lng * RAD), Math.cos(lat * RAD) * Math.sin(lng * RAD), Math.sin(lat * RAD)];
}

function toLngLat([x, y, z]: [number, number, number]): LngLatTuple {
  return [Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD];
}

/** Points along the shorter great circle from `a` to `b`, both ends included. */
export function greatCircle(a: LngLatTuple, b: LngLatTuple, segments = 48): LngLatTuple[] {
  const angle = angularDistance(a, b) * RAD;
  if (angle < 1e-6) return [a, b];
  const va = toVector(a);
  const vb = toVector(b);
  const points: LngLatTuple[] = [];
  for (let step = 0; step <= segments; step += 1) {
    const t = step / segments;
    const wa = Math.sin((1 - t) * angle) / Math.sin(angle);
    const wb = Math.sin(t * angle) / Math.sin(angle);
    points.push(toLngLat([wa * va[0] + wb * vb[0], wa * va[1] + wb * vb[1], wa * va[2] + wb * vb[2]]));
  }
  return points;
}

/**
 * Keeps each longitude within 180° of the previous one (values may leave
 * [-180, 180]), so a leg across the antimeridian is drawn the short way.
 */
export function unwrapLongitudes(points: readonly LngLatTuple[]): LngLatTuple[] {
  const result: LngLatTuple[] = [];
  for (const [lng, lat] of points) {
    const previous = result[result.length - 1];
    if (!previous) {
      result.push([lng, lat]);
      continue;
    }
    let next = lng;
    while (next - previous[0] > 180) next -= 360;
    while (next - previous[0] < -180) next += 360;
    result.push([next, lat]);
  }
  return result;
}

/** The whole route through `stops` in order, as one continuous line. Fewer than two stops: no line. */
export function routeLine(stops: readonly LngLatTuple[]): LngLatTuple[] {
  if (stops.length < 2) return [];
  const points: LngLatTuple[] = [];
  for (let index = 1; index < stops.length; index += 1) {
    const leg = greatCircle(stops[index - 1], stops[index]);
    points.push(...(index === 1 ? leg : leg.slice(1)));
  }
  return unwrapLongitudes(points);
}

/** The first `fraction` (0–1) of a line, by point count; used to draw the route in. */
export function partialLine(line: readonly LngLatTuple[], fraction: number): LngLatTuple[] {
  if (line.length < 2) return [...line];
  const clamped = Math.min(1, Math.max(0, fraction));
  const exact = clamped * (line.length - 1);
  const whole = Math.floor(exact);
  const points = line.slice(0, whole + 1);
  if (whole < line.length - 1 && exact > whole) {
    const [lng1, lat1] = line[whole];
    const [lng2, lat2] = line[whole + 1];
    const t = exact - whole;
    points.push([lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t]);
  }
  return points.length >= 2 ? points : [line[0], line[0]];
}

/** Largest angle between any two stops, in degrees. */
export function routeSpread(stops: readonly LngLatTuple[]): number {
  let spread = 0;
  for (let i = 0; i < stops.length; i += 1) {
    for (let j = i + 1; j < stops.length; j += 1) spread = Math.max(spread, angularDistance(stops[i], stops[j]));
  }
  return spread;
}

const MAX_TRIP_ZOOM = 4.2;

/**
 * Camera for a trip: the globe turns toward the stops (worldViewCenter) and
 * zooms in as far as their spread allows. A worldwide trip keeps the whole
 * globe; a trip within one region of the world zooms in on it.
 */
export function tripCamera(stops: readonly LngLatTuple[], width: number, height: number): { center: LngLatTuple; zoom: number } {
  const center = worldViewCenter(stops, 170);
  const globe = globeZoomFor(width, height, GLOBE_FILL, center[1]);
  if (stops.length === 0) return { center, zoom: globe };
  // The globe disc shows about 90° either way from its center; zoom in while the stops fit in less.
  const spread = Math.max(routeSpread(stops), 8);
  const step = Math.max(0, Math.log2(100 / spread));
  // worldViewCenter keeps the world view near the tropics; a zoomed-in trip centers on its own latitude.
  const latitudes = stops.map(([, lat]) => lat);
  const middle = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  return {
    center: step > 0 ? [center[0], Math.max(-70, Math.min(70, middle))] : center,
    zoom: Math.min(MAX_TRIP_ZOOM, globe + step),
  };
}
