import type { Map as MapLibreMap } from "maplibre-gl";
import {
  anchoredCenter,
  type Bounds,
  boundsContain,
  clampWorldLatitude,
  countryBounds,
  GLOBE_FILL,
  globeZoomFor,
  type LngLatTuple,
  worldViewCenter,
} from "@/modules/map-experience/lib/geometry";
import type { MapHandle } from "./keep-alive";
import { prefersReducedMotion } from "./load";
import { type CameraTarget, easeOutCubic, flightPlan } from "./motion";
import type { MapView } from "./view";

/** Where the camera goes for each view, and how it gets there. */

const COUNTRY_MAX_ZOOM = 6;
const COUNTRY_CENTER_ZOOM = 4.5;
/** A region view zooms half a step past the country fit, so the outline and sibling regions stay in frame. */
const REGION_ZOOM_STEP = 0.5;
const REGION_MIN_ZOOM = 4;
const REGION_MAX_ZOOM = 6;

/** Degrees a region may sit outside the box its country view fits and still count as in frame (coasts past the simplified outline). */
const REGION_FIT_MARGIN = 0.5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Zoom for a region view: half a step past the country fit. Large countries zoom
 * further, to REGION_MIN_ZOOM, but never more than one step past the fit, so the
 * outline stays readable on small frames.
 */
export function regionZoom(fitZoom: number): number {
  return clamp(fitZoom + REGION_ZOOM_STEP, Math.min(REGION_MIN_ZOOM, fitZoom + 1), REGION_MAX_ZOOM);
}

function cachedBounds(handle: MapHandle, iso: string): Bounds | null {
  if (!handle.boundsCache.has(iso)) handle.boundsCache.set(iso, countryBounds(handle.countries, iso));
  return handle.boundsCache.get(iso) ?? null;
}

function fitPadding(slot: HTMLElement) {
  const side = Math.min(slot.clientWidth, slot.clientHeight);
  const base = Math.round(Math.min(72, Math.max(20, side * 0.11)));
  // A little extra on the right for the zoom buttons; the legend sits below the frame.
  return { top: base, right: base + 24, bottom: base, left: base };
}

/** Fits the country's outline, or centers on its coordinates; null when it can't be placed. */
function countryCamera(
  handle: MapHandle,
  iso: string | null,
  center: LngLatTuple | null,
  slot: HTMLElement,
): CameraTarget | null {
  const bounds = iso ? cachedBounds(handle, iso) : null;
  const fit = bounds
    ? handle.map.cameraForBounds(bounds, { padding: fitPadding(slot), maxZoom: COUNTRY_MAX_ZOOM })
    : undefined;
  if (fit?.center && typeof fit.zoom === "number") {
    const { lng, lat } = handle.lib.LngLat.convert(fit.center);
    return { center: [lng, lat], zoom: fit.zoom };
  }
  return center ? { center, zoom: COUNTRY_CENTER_ZOOM } : null;
}

/**
 * The world globe. Zooming out from a country or region keeps it in view; a
 * fresh map turns toward the curated places.
 */
function worldCamera(handle: MapHandle, view: MapView, slot: HTMLElement): CameraTarget {
  let center: LngLatTuple;
  if (handle.focusKey !== null && handle.focusKey !== "world") {
    const { lng, lat } = handle.map.getCenter();
    center = [lng, clampWorldLatitude(lat)];
  } else {
    center = worldViewCenter(view.worldPoints);
  }
  return { center, zoom: globeZoomFor(slot.clientWidth, slot.clientHeight, GLOBE_FILL, center[1]) };
}

/**
 * Camera for a view. A country or region that can't be placed (no outline
 * and no coordinates) gets the world view, so the map never stays on the
 * previous page's place.
 */
export function resolveCamera(handle: MapHandle, view: MapView, slot: HTMLElement): CameraTarget {
  const { camera } = view;
  if (camera.kind === "world") return worldCamera(handle, view, slot);
  if (camera.kind === "country") {
    return countryCamera(handle, camera.iso, camera.center, slot) ?? worldCamera(handle, view, slot);
  }
  if (camera.center) {
    // Regions have no outlines, so keep the country's fit and zoom in a little about the region:
    // it stays where it was on the country view, and a step to a sibling region is a short nudge.
    const fit = countryCamera(handle, camera.iso, null, slot);
    const bounds = camera.iso ? cachedBounds(handle, camera.iso) : null;
    if (!fit || !bounds) return { center: camera.center, zoom: REGION_MAX_ZOOM };
    const zoom = regionZoom(fit.zoom);
    // A region outside the part of the country its view fits (the Canary Islands for Spain, the
    // Galápagos for Ecuador) is off-frame on the country view, so centre on it instead.
    if (!boundsContain(bounds, camera.center, REGION_FIT_MARGIN)) return { center: camera.center, zoom };
    // The effective step, after clamping, so a large country held at REGION_MIN_ZOOM still anchors.
    return { center: anchoredCenter(fit.center, camera.center, zoom - fit.zoom), zoom };
  }
  return countryCamera(handle, camera.iso, camera.countryCenter, slot) ?? worldCamera(handle, view, slot);
}

/** Jumps, eases or flies with a fixed duration for the distance (see motion.ts). */
export function moveCamera(map: MapLibreMap, target: CameraTarget) {
  const { lng, lat } = map.getCenter();
  const plan = flightPlan({ center: [lng, lat], zoom: map.getZoom() }, target, prefersReducedMotion());
  if (plan.kind === "jump") map.jumpTo(target);
  else if (plan.kind === "ease") map.easeTo({ ...target, duration: plan.duration, easing: easeOutCubic, essential: true });
  else map.flyTo({ ...target, duration: plan.duration, essential: true });
}
