import type { Map as MapLibreMap } from "maplibre-gl";
import type { Bounds, CountryCollection } from "@/modules/map-experience/lib/geometry";
import type { MapLibreModule } from "./load";
import { clearMarkers, type MarkerHandlers, type MarkerLayer } from "./markers";
import type { MapBindings } from "./types";
import type { MapView } from "./view";

/**
 * One MapLibre map per tab, kept alive across page swaps. Every explore page
 * renders its own <ExploreMap>, and Next unmounts the old page on each
 * navigation. Instead of rebuilding the map (seconds of loading and shader
 * compilation), the unmounting page parks its host element off-screen and
 * the next page adopts it in the same commit, before paint. A map nobody
 * adopts (a long stay on a bean or drink page) is disposed after a while.
 * Browser-only: nothing here runs during server rendering.
 */

export interface MapHandle {
  lib: MapLibreModule;
  map: MapLibreMap;
  /** MapLibre's container, created outside React so it can move between pages. */
  host: HTMLDivElement;
  countries: CountryCollection;
  boundsCache: Map<string, Bounds | null>;
  layer: MarkerLayer;
  /** Created once with the map; they read `ui` at event time. */
  handlers: MarkerHandlers;
  /** What the map shows now: the page's view, or the target of a pending navigation. */
  view: MapView | null;
  /** The focus the camera was last moved to; null until the first move. */
  focusKey: string | null;
  hoveredIso: string | null;
  /** Loaded and rendered once; only a ready map is parked and adopted. */
  ready: boolean;
  /** The WebGL context is gone. */
  lost: boolean;
  /** Last non-zero size of the host, kept while it is parked. */
  size: { w: number; h: number };
  ui: MapBindings | null;
}

/** A parked map is disposed after this long (a visit to a bean or drink page usually ends sooner). */
const PARK_TTL_MS = 180_000;

let live: MapHandle | null = null;
let parking: HTMLDivElement | null = null;
let disposeTimer: ReturnType<typeof setTimeout> | undefined;
/** A marker (or control) that had focus when the map was parked. */
let parkedFocus: HTMLElement | null = null;

function removeMap(handle: MapHandle): void {
  clearMarkers(handle.layer);
  handle.ui = null;
  handle.map.remove();
  handle.host.remove();
}

/** Disposes a map that can't be kept: the live one, or one that never became live. */
export function discard(handle: MapHandle): void {
  if (handle === live) disposeLiveMap();
  else removeMap(handle);
}

/** The tab's map if it can be adopted: ready and with its WebGL context. */
export function getLiveMap(): MapHandle | null {
  return live?.ready && !live.lost ? live : null;
}

/** Makes `handle` the tab's live map (once it is ready). */
export function register(handle: MapHandle): void {
  if (live && live !== handle) disposeLiveMap();
  live = handle;
}

/**
 * Moves the host off-screen when its page unmounts. The parking element keeps
 * the host's size (MapLibre resizes a detached, 0×0 container to 400×300) and
 * hides it from pointers, focus and assistive technology. The camera is not
 * stopped, so a flight started on the old page continues on the new one.
 */
export function park(handle: MapHandle): void {
  if (handle !== live) {
    removeMap(handle);
    return;
  }
  const active = document.activeElement;
  parkedFocus = active instanceof HTMLElement && handle.host.contains(active) ? active : null;
  const { clientWidth: w, clientHeight: h } = handle.host;
  if (w > 0 && h > 0) handle.size = { w, h };

  parking ??= document.createElement("div");
  parking.style.cssText = `position:fixed;left:-10000px;top:0;width:${handle.size.w}px;height:${handle.size.h}px;visibility:hidden;pointer-events:none;overflow:hidden`;
  parking.setAttribute("aria-hidden", "true");
  parking.inert = true;
  if (!parking.isConnected) document.body.append(parking);
  parking.append(handle.host);

  clearTimeout(disposeTimer);
  disposeTimer = setTimeout(disposeLiveMap, PARK_TTL_MS);
}

/** Moves the live map into `slot`; null when there is none to adopt. */
export function adopt(slot: HTMLDivElement): MapHandle | null {
  const handle = getLiveMap();
  if (!handle) return null;
  clearTimeout(disposeTimer);
  disposeTimer = undefined;
  slot.append(handle.host);
  parking?.remove();

  const { clientWidth: w, clientHeight: h } = slot;
  if (w !== handle.size.w || h !== handle.size.h) {
    handle.map.resize();
    if (w > 0 && h > 0) handle.size = { w, h };
    // Framed for the old size (the viewport changed while it was parked): the adopting page refits it.
    handle.focusKey = null;
  }
  if (parkedFocus?.isConnected) parkedFocus.focus({ preventScroll: true });
  parkedFocus = null;
  return handle;
}

function disposeLiveMap(): void {
  clearTimeout(disposeTimer);
  disposeTimer = undefined;
  parkedFocus = null;
  const handle = live;
  live = null;
  if (handle) removeMap(handle);
  parking?.remove();
  parking = null;
}
