"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { MapLayerMouseEvent } from "maplibre-gl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { preload } from "react-dom";
import { GLOBE_FILL, globeZoomFor, normalizeIso, worldViewCenter } from "@/modules/map-experience/lib/geometry";
import { focusFromPath, mapKey } from "@/modules/map-experience/lib/links";
import type { ExploreMapProps, MapCountry, MapFocus, MapRegion } from "@/modules/map-experience/lib/map-model";
import styles from "./explore-map.module.css";
import {
  arrivalScroll,
  INTENT_TIMEOUT_MS,
  matchIntent,
  PINNED_FRAME_TOP,
  type PendingIntent,
  WIDE_LAYOUT_QUERY,
} from "./map/arrival";
import { moveCamera, resolveCamera } from "./map/camera";
import { adopt, discard, getLiveMap, type MapHandle, park, register } from "./map/keep-alive";
import {
  COUNTRIES_URL,
  loadCountries,
  loadMapLibre,
  prefersCoarsePointer,
  prefersReducedMotion,
  warmMapResources,
  webglSupported,
} from "./map/load";
import { syncMarkers } from "./map/markers";
import { applyViewToLayers, buildMapStyle, COUNTRIES_SOURCE, CURATED_LAYER } from "./map/style";
import type { IntentOrigin, MapBindings, MapStatus, Router, TooltipAnchor, TooltipState } from "./map/types";
import { buildMapView, focusKeyOf, type MapView, type MarkerSpec } from "./map/view";

const ERROR_MESSAGE = "The map couldn’t load.";
const ERROR_MESSAGE_WITH_LIST = "The map couldn’t load. Every location it would show is still listed on this page.";

/** Fallback in case MapLibre never reports "idle" after its first render. */
const READY_FALLBACK_MS = 2500;
/** Half of `.tooltip { max-width: 220px }` in explore-map.module.css. */
const TOOLTIP_HALF_WIDTH = 110;
/** Closer to the top of the frame than this, the tooltip opens below its anchor. */
const TOOLTIP_FLIP_Y = 72;
/** A phone map tap's scroll counts as done after this long if `scrollend` never fires. */
const PIN_SCROLL_MAX_MS = 700;

/**
 * Full prefetch on hover or focus, so the click can render at once. `kind` is
 * accepted by router.prefetch (PrefetchOptions) but not documented; prefetching
 * only runs in production.
 */
const FULL_PREFETCH = { kind: "full" } as Parameters<Router["prefetch"]>[1];

/** The navigation the map is moving toward; the page that arrives takes it (map/arrival.ts). */
let pendingIntent: PendingIntent | null = null;
/** Where the scroll a phone map tap started is heading, while it runs. */
let pinTarget: number | null = null;
/**
 * What Back gives focus to again on an explore page: the link followed from it (the `index`-th
 * link in <main> with that href, as a page can link twice to the same place), or the map marker
 * activated there with the keyboard.
 */
type ReturnFocus = { href: string; index: number } | { marker: string };
/** Per history entry (see entryKey), so Back to an earlier visit of a page never focuses what a later one followed. */
const returnFocus = new Map<string, ReturnFocus>();
/** The history entry a Back/Forward traversal landed on, until the page there mounts (see isTraversal). */
let traversedTo: string | null = null;
/** A popstate event a mounting page already recognised while it was being dispatched. */
let handledTraversal: Event | null = null;

/**
 * The current history entry: its Navigation API key where the browser has one (stable across
 * replaceState, and new for every push), else the pathname.
 */
function entryKey(pathname = window.location.pathname): string {
  const navigation = (window as Window & { navigation?: { currentEntry?: { key: string } | null } }).navigation;
  return navigation?.currentEntry?.key ?? pathname;
}

if (typeof window !== "undefined") {
  // Start downloading MapLibre and the outlines as soon as this module loads, not when the map mounts.
  warmMapResources();
  window.addEventListener("popstate", (event) => {
    if (event !== handledTraversal) traversedTo = entryKey();
  });
}

/**
 * Whether the page mounting at `pathname` was reached with Back or Forward.
 * React renders a popstate navigation synchronously when it can, inside
 * Next's own popstate listener, which may run before this module's: then the
 * event is still being dispatched. A render that had to wait for data comes
 * after this module's listener has recorded the entry. A push always makes a
 * new entry, so a record left by a popstate that mounted nothing (a hash-only
 * Back, such as after the skip link) never matches a later link's arrival.
 */
function isTraversal(pathname: string): boolean {
  // window.event is deprecated, but it is the only way to see the event being dispatched (React reads it too).
  const dispatching = window.event;
  const traversal = dispatching?.type === "popstate" || traversedTo === entryKey(pathname);
  if (dispatching?.type === "popstate") handledTraversal = dispatching;
  traversedTo = null;
  return traversal;
}

const subscribeNothing = () => () => {};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Brings layers, camera and markers in line with `view`. */
function showView(handle: MapHandle, view: MapView, slot: HTMLElement, animate: boolean) {
  handle.view = view;
  applyViewToLayers(handle.map, view, { animate });
  if (handle.focusKey !== view.focusKey) {
    // Move first, so markers new to this view wait for the camera to settle before they fade in.
    moveCamera(handle.map, resolveCamera(handle, view, slot));
    handle.focusKey = view.focusKey;
  }
  syncMarkers(handle.lib, handle.map, handle.layer, view.markers, handle.handlers, { animate });
}

/**
 * On touch screens marker hit areas are 44px and can overlap, so a tap goes to
 * the visible marker whose dot is nearest the finger. Keyboard activation
 * (detail 0), mouse clicks (which only hit the dot or name itself) and taps on
 * a region's name keep their marker.
 */
function markerForTap(handle: MapHandle, spec: MarkerSpec, event: MouseEvent, slot: HTMLElement): MarkerSpec {
  if (event.detail === 0 || !prefersCoarsePointer()) return spec;
  if (event.target instanceof Element && event.target.closest(`.${styles.label}`)) return spec;
  const rect = slot.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let nearest = spec;
  let nearestGap = Number.POSITIVE_INFINITY;
  for (const entry of handle.layer.entries.values()) {
    if (entry.leaving || entry.element.classList.contains("maplibregl-marker-covered")) continue;
    const point = handle.map.project(entry.spec.lngLat);
    const gap = Math.hypot(point.x - x, point.y - y) - entry.spec.diameter / 2;
    if (gap < nearestGap) {
      nearest = entry.spec;
      nearestGap = gap;
    }
  }
  return nearest;
}

/** Records the hovered outline, and tints it while the map has a style (MapLibre drops it when the WebGL context is lost). */
function setHoveredIso(handle: MapHandle, iso: string | null) {
  if (handle.hoveredIso === iso) return;
  const previous = handle.hoveredIso;
  handle.hoveredIso = iso;
  if (handle.lost) return;
  if (previous) handle.map.setFeatureState({ source: COUNTRIES_SOURCE, id: previous }, { hover: false });
  if (iso) handle.map.setFeatureState({ source: COUNTRIES_SOURCE, id: iso }, { hover: true });
}

function tooltipAt(slot: HTMLElement, key: string, title: string, detail: string, x: number, y: number): TooltipState {
  const half = Math.min(TOOLTIP_HALF_WIDTH, slot.clientWidth / 2);
  return {
    key,
    title,
    detail,
    x: Math.min(Math.max(x, half), slot.clientWidth - half),
    y,
    below: y < TOOLTIP_FLIP_Y,
  };
}

/** Marker callbacks, created once with the map. They act through whichever page currently holds it. */
function markerHandlers(getHandle: () => MapHandle): MapHandle["handlers"] {
  return {
    onShow(spec) {
      const current = getHandle();
      const ui = current.ui;
      if (!ui) return;
      setHoveredIso(current, spec.iso);
      ui.getRouter().prefetch(spec.href, FULL_PREFETCH);
      ui.anchorRef.current = { kind: "marker", key: spec.key, lngLat: spec.lngLat };
      const point = current.map.project(spec.lngLat);
      ui.setTooltip(tooltipAt(ui.slot, spec.key, spec.name, spec.detail, point.x, point.y - spec.diameter / 2));
    },
    onHide(spec) {
      const current = getHandle();
      if (!current.ui) return;
      if (current.hoveredIso === spec.iso) setHoveredIso(current, null);
      current.ui.hideTooltip(spec.key);
    },
    onActivate(spec, event) {
      const current = getHandle();
      const ui = current.ui;
      if (!ui) return;
      const target = markerForTap(current, spec, event, ui.slot);
      if (target.selected) return;
      ui.startIntent(target.href, "map");
      // Keyboard only: focusing a marker shows its tooltip, which a mouse or touch user going Back didn't ask for.
      if (event.detail === 0) returnFocus.set(entryKey(), { marker: target.key });
      ui.getRouter().push(target.href, { scroll: false });
    },
  };
}

/**
 * Map listeners, registered once when the map is created. They read
 * `handle.ui` at event time, so a parked map does nothing and an adopted one
 * acts for its new page, never through a previous page's closures.
 */
function bindMapEvents(handle: MapHandle) {
  const { map } = handle;
  const curatedAt = (event: MapLayerMouseEvent) => {
    const iso = normalizeIso(event.features?.[0]?.properties?.iso);
    const view = handle.view;
    return iso && view && iso !== view.focusedIso ? view.curated.find((item) => item.iso === iso) : undefined;
  };
  const clearPointerHover = () => {
    setHoveredIso(handle, null);
    map.getCanvas().style.cursor = "";
    if (handle.ui?.anchorRef.current?.kind === "pointer") handle.ui.hideTooltip();
  };

  // Curated country outlines: hover tooltip, pointer cursor and navigation.
  map.on("mousemove", CURATED_LAYER, (event) => {
    const ui = handle.ui;
    if (!ui) return;
    const entry = curatedAt(event);
    if (!entry || map.isMoving()) {
      clearPointerHover();
      return;
    }
    setHoveredIso(handle, entry.iso);
    map.getCanvas().style.cursor = "pointer";
    const key = `outline:${entry.iso}`;
    ui.anchorRef.current = { kind: "pointer", key };
    ui.setTooltip(tooltipAt(ui.slot, key, entry.name, entry.detail, event.point.x, event.point.y));
  });
  map.on("mouseleave", CURATED_LAYER, () => {
    if (handle.ui) clearPointerHover();
  });
  map.on("click", CURATED_LAYER, (event) => {
    const ui = handle.ui;
    if (!ui) return;
    const target = event.originalEvent.target;
    if (target instanceof Element && target.closest("[data-map-marker]")) return;
    const entry = curatedAt(event);
    if (!entry) return;
    ui.startIntent(entry.href, "map");
    ui.getRouter().push(entry.href, { scroll: false });
  });

  // Keep a marker tooltip attached while the camera moves; drop pointer tooltips.
  map.on("move", () => {
    const ui = handle.ui;
    const anchor = ui?.anchorRef.current;
    if (!ui || !anchor) return;
    if (anchor.kind === "pointer") {
      ui.hideTooltip();
      return;
    }
    const point = map.project(anchor.lngLat);
    ui.setTooltip((previous) =>
      previous && previous.key === anchor.key
        ? tooltipAt(ui.slot, previous.key, previous.title, previous.detail, point.x, point.y)
        : previous,
    );
  });

  map.on("webglcontextlost", () => {
    handle.lost = true;
    // MapLibre drops the style with the context; a restored style has no hover state either.
    handle.hoveredIso = null;
    map.getCanvas().style.cursor = "";
    const ui = handle.ui;
    if (ui) {
      ui.hideTooltip();
      ui.setStatus("error");
    } else {
      // A parked map is simply dropped; the next page builds a new one.
      discard(handle);
    }
  });
  map.on("webglcontextrestored", () => {
    handle.lost = false;
    if (handle.ui && handle.ready) handle.ui.setStatus("ready");
  });
}

/**
 * On a phone, a map tap scrolls the map frame up to the top of the screen
 * (smoothly, while the camera moves), so the whole map and its caption are in
 * view and the arriving page only has to absorb the change in layout above it.
 * Returns the frame's viewport top once that scroll is done.
 */
function pinFrame(frameTop: number): number {
  if (Math.abs(frameTop - PINNED_FRAME_TOP) <= 1) return frameTop;
  const from = window.scrollY;
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const top = clamp(from + frameTop - PINNED_FRAME_TOP, 0, max);
  if (Math.abs(top - from) < 1) return frameTop;
  const smooth = !prefersReducedMotion();
  window.scrollTo({ top, behavior: smooth ? "smooth" : "instant" });
  if (smooth) {
    pinTarget = top;
    const done = () => {
      if (pinTarget === top) pinTarget = null;
      clearTimeout(timer);
      window.removeEventListener("scrollend", done);
    };
    const timer = setTimeout(done, PIN_SCROLL_MAX_MS);
    window.addEventListener("scrollend", done);
  }
  return frameTop - (top - from);
}

/** Applies arrivalScroll (map/arrival.ts) for the intent that brought this page. */
function scrollOnArrival(intent: PendingIntent, layout: HTMLElement | null, frame: HTMLElement | null) {
  const steps = arrivalScroll({
    origin: intent.origin,
    wide: window.matchMedia(WIDE_LAYOUT_QUERY).matches,
    reducedMotion: prefersReducedMotion(),
    scrollY: window.scrollY,
    frameTopThen: intent.frameTop,
    frameDocTopThen: intent.frameDocTop,
    frameTopNow: frame ? frame.getBoundingClientRect().top : null,
    layoutTop: layout ? layout.getBoundingClientRect().top : null,
    pinTarget,
  });
  for (const step of steps) window.scrollTo(step);
  // Any pin scroll still running has been taken over (or was already done).
  pinTarget = null;
}

/** Where focus goes once a page that a navigation mounted has synced its map. */
type ArrivalFocus =
  | { kind: "heading"; onlyIfVisible: boolean }
  | { kind: "link"; href: string; index: number }
  | { kind: "marker"; key: string };

/** Navigation leaves focus on <body> when the focused element left with the old page. */
const focusIsFree = () => !document.activeElement || document.activeElement === document.body;

function focusHeading(layout: HTMLElement | null, onlyIfVisible: boolean) {
  if (!focusIsFree()) return;
  const heading = layout?.querySelector<HTMLElement>("[data-explore-heading]");
  if (!heading?.isConnected) return;
  if (onlyIfVisible && heading.getBoundingClientRect().bottom <= 0) return;
  heading.focus({ preventScroll: true });
}

function focusLink(href: string, index: number) {
  if (!focusIsFree()) return;
  const links = document.querySelectorAll<HTMLElement>(`main a[href="${CSS.escape(href)}"]`);
  (links[index] ?? links[links.length - 1])?.focus({ preventScroll: true });
}

function focusMarker(key: string) {
  if (!focusIsFree()) return;
  document.querySelector<HTMLElement>(`[data-map-marker="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
}

/** What the traversal branch gives focus to, from the entry recorded when this page was left. */
function returnFocusArrival(entry: ReturnFocus | undefined): ArrivalFocus | null {
  if (!entry) return null;
  return "marker" in entry ? { kind: "marker", key: entry.marker } : { kind: "link", ...entry };
}

/** "Harar, Ethiopia" for the caption under the map; null at world level. */
function captionPlace(countries: readonly MapCountry[], regions: readonly MapRegion[], focus: MapFocus): string | null {
  if (focus.level === "world") return null;
  const country = countries.find((candidate) => candidate.id === focus.countryId);
  if (!country) return null;
  if (focus.level === "country") return country.name;
  const region = regions.find((candidate) => candidate.id === focus.regionId && candidate.countryId === country.id);
  return region ? `${region.name}, ${country.name}` : country.name;
}

/**
 * Interactive globe for /explore. Countries with curated content are tinted
 * and clickable; HTML markers (real buttons) open country and region pages.
 * One MapLibre map per tab moves from page to page (see map/keep-alive.ts),
 * and a click moves the camera before the next page has loaded.
 * The map is an enhancement: the pages always render the same locations as
 * lists, and this component falls back to a short notice when WebGL, the
 * map library or the outlines are unavailable.
 */
export function ExploreMap({ countries, regions, focus, label }: ExploreMapProps) {
  const router = useRouter();
  const pathname = usePathname();
  // False only in the hydration render of a hard load; true when a client-side navigation mounted this page.
  const mountedByNavigation = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const slotRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  /** The map, once it is ready and while this page holds it. */
  const handleRef = useRef<MapHandle | null>(null);
  const bindingsRef = useRef<MapBindings | null>(null);
  const anchorRef = useRef<TooltipAnchor | null>(null);
  /** Decided on mount (undefined until then); the first sync applies it. */
  const arrivalFocusRef = useRef<ArrivalFocus | null | undefined>(undefined);
  // The server and hydration renders never have a live map, so their markup matches.
  const [status, setStatus] = useState<MapStatus>(() => (getLiveMap() ? "ready" : "loading"));
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const view = useMemo(() => buildMapView(countries, regions, focus), [countries, regions, focus]);
  const viewRef = useRef(view);
  const dataRef = useRef({ countries, regions });
  const routerRef = useRef(router);
  // The mount effect runs once, so snapshots of the mount's pathname and navigation kind are what it needs.
  const mountPathnameRef = useRef(pathname);
  const mountedByNavigationRef = useRef(mountedByNavigation);

  // One request: the server-rendered preload matches the credentials mode of loadCountries' fetch.
  // In the browser this module has already started that fetch (warmMapResources), so a preload
  // added on a client-side visit would only download the outlines a second time.
  if (typeof window === "undefined") preload(COUNTRIES_URL, { as: "fetch", crossOrigin: "anonymous" });

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    dataRef.current = { countries, regions };
  }, [countries, regions]);

  // Adopt the tab's live map, or create one. A layout effect, so the previous
  // page's cleanup (which parks the map) and this adoption happen in the same
  // commit, before paint. StrictMode's extra mount is cancelled before any map
  // exists because creation waits for the library and outlines.
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const layout = slot.closest<HTMLElement>("[data-explore-layout]");
    let cancelled = false;
    let handle: MapHandle | null = null;
    let host: HTMLDivElement | null = null;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    let intentTimer: ReturnType<typeof setTimeout> | undefined;

    const hideTooltip = (key?: string) => {
      if (key && anchorRef.current?.key !== key) return;
      anchorRef.current = null;
      setTooltip(null);
    };

    const clearHover = (current: MapHandle) => {
      hideTooltip();
      setHoveredIso(current, null);
      current.map.getCanvas().style.cursor = "";
    };

    /**
     * Moves the map toward a link's page as soon as it is clicked, while the
     * server renders it. The arriving page finds the camera on its way (same
     * focus key), so it doesn't start a second flight.
     */
    const startIntent = (href: string, origin: IntentOrigin) => {
      // A new navigation supersedes a Back/Forward that hasn't arrived (where entries have no keys).
      traversedTo = null;
      let path: string;
      try {
        path = new URL(href, window.location.href).pathname;
      } catch {
        return;
      }
      const target = focusFromPath(path);
      if (!target) return;
      // A map tap follows no link on this page, so Back shouldn't focus one it followed earlier.
      if (origin === "map") returnFocus.delete(entryKey());
      const current = handleRef.current;
      const key = focusKeyOf(target);
      const page = viewRef.current;
      if (key === page.focusKey) {
        // Back to the page we are on, which Next keeps mounted: drop any pending intent and its camera move.
        clearTimeout(intentTimer);
        pendingIntent = null;
        layout?.removeAttribute("data-pending");
        if (current && !current.lost && current.focusKey !== page.focusKey) {
          showView(current, page, slot, !prefersReducedMotion());
          clearHover(current);
        }
        return;
      }
      if (current && key === current.focusKey) return; // Already on its way there.

      if (current && !current.lost) {
        const { countries: knownCountries, regions: knownRegions } = dataRef.current;
        showView(current, buildMapView(knownCountries, knownRegions, target), slot, !prefersReducedMotion());
        clearHover(current);
      }
      const frame = frameRef.current?.getBoundingClientRect();
      const frameDocTop = (frame?.top ?? 0) + window.scrollY;
      const narrow = !window.matchMedia(WIDE_LAYOUT_QUERY).matches;
      const frameTop = frame && origin === "map" && narrow ? pinFrame(frame.top) : (frame?.top ?? 0);
      pendingIntent = { pathname: path, origin, frameTop, frameDocTop, at: performance.now() };
      layout?.setAttribute("data-pending", "");

      clearTimeout(intentTimer);
      intentTimer = setTimeout(() => {
        // Slow, not failed: Next falls back to a full page load if the request fails. Stop dimming,
        // and leave the camera on its way.
        layout?.removeAttribute("data-pending");
      }, INTENT_TIMEOUT_MS);
    };

    const bindings: MapBindings = {
      slot,
      getRouter: () => routerRef.current,
      setTooltip,
      hideTooltip,
      setStatus,
      anchorRef,
      startIntent,
    };
    bindingsRef.current = bindings;

    const adopted = adopt(slot);
    if (adopted) {
      adopted.ui = bindings;
      handle = adopted;
      handleRef.current = adopted;
      if (adopted.focusKey === null) {
        // The viewport changed while the map was parked: frame this page before paint.
        adopted.map.jumpTo(resolveCamera(adopted, viewRef.current, slot));
        adopted.focusKey = viewRef.current.focusKey;
      }
      setStatus("ready");
    } else {
      setStatus("loading");
      const fail = (error: unknown) => {
        if (cancelled) return;
        console.warn("[explore-map] The map could not load; the location lists remain available.", error);
        if (handle) discard(handle);
        handle = null;
        handleRef.current = null;
        hideTooltip();
        setStatus("error");
      };

      const start = async () => {
        if (!webglSupported()) throw new Error("WebGL is not available in this browser.");
        const container = document.createElement("div");
        container.style.cssText = "position:absolute;inset:0";
        slot.append(container);
        host = container;
        const [lib, outlines] = await Promise.all([loadMapLibre(), loadCountries()]);
        if (cancelled) return;

        const initialView = viewRef.current;
        const worldCenter = worldViewCenter(initialView.worldPoints);
        const map = new lib.Map({
          container,
          style: buildMapStyle(
            outlines,
            initialView.curated.map((entry) => entry.iso),
            initialView.focusedIso,
            initialView.emphasizedIso,
            { reducedMotion: prefersReducedMotion(), emphasisOpacity: initialView.emphasisOpacity },
          ),
          center: worldCenter,
          zoom: globeZoomFor(slot.clientWidth, slot.clientHeight, GLOBE_FILL, worldCenter[1]),
          minZoom: 0.2,
          maxZoom: 9,
          maxPitch: 0,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          rollEnabled: false,
          // Plain wheel and one-finger drags scroll the page; Ctrl/⌘ + wheel or two fingers move the map.
          cooperativeGestures: true,
          fadeDuration: 0,
          // Multisampling roughly doubles the cost of each frame; dense screens don't need it.
          canvasContextAttributes: { antialias: window.devicePixelRatio < 2 },
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          // Credits are plain links in the caption under the map.
          attributionControl: false,
          locale: {
            "Map.Title": "Map. Use arrow keys to pan and plus or minus to zoom.",
          },
        });
        const current: MapHandle = {
          lib,
          map,
          host: container,
          countries: outlines,
          boundsCache: new Map(),
          layer: { entries: new Map() },
          handlers: markerHandlers(() => current),
          view: null,
          focusKey: null,
          hoveredIso: null,
          ready: false,
          lost: false,
          size: { w: slot.clientWidth, h: slot.clientHeight },
          ui: bindings,
        };
        handle = current;
        // Start at the page's own camera rather than the world view.
        map.jumpTo(resolveCamera(current, initialView, slot));

        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");

        let loaded = false;
        map.on("error", (event) => {
          if (!loaded) fail(event.error);
          else console.warn("[explore-map]", event.error);
        });
        bindMapEvents(current);

        map.once("load", () => {
          loaded = true;
          if (cancelled) return;
          const latest = viewRef.current;
          map.jumpTo(resolveCamera(current, latest, slot));
          current.focusKey = latest.focusKey;
          current.view = latest;
          applyViewToLayers(map, latest, { animate: false });
          syncMarkers(lib, map, current.layer, latest.markers, current.handlers, { animate: false });

          let ready = false;
          const markReady = () => {
            if (ready || cancelled) return;
            ready = true;
            clearTimeout(readyTimer);
            current.ready = true;
            register(current);
            handleRef.current = current;
            if (!current.lost) setStatus("ready");
          };
          map.once("idle", markReady);
          readyTimer = setTimeout(markReady, READY_FALLBACK_MS);
        });
      };

      start().catch(fail);
    }

    // Arrival, whether or not the map itself is available. Decided once per mount (StrictMode
    // runs this effect twice, and the first run takes the module state).
    if (arrivalFocusRef.current === undefined) {
      const mountPathname = mountPathnameRef.current;
      // Back or Forward outranks a link to the same page that was still pending: the traversal
      // superseded it, and the browser restores the scroll position.
      const traversal = isTraversal(mountPathname);
      const intent = traversal ? null : matchIntent(pendingIntent, mountPathname, performance.now());
      pendingIntent = null;
      if (traversal) {
        // Focus returns to the link followed from here, or the marker Enter activated (or stays put),
        // not to a heading that may be off-screen.
        arrivalFocusRef.current = returnFocusArrival(returnFocus.get(entryKey(mountPathname)));
      } else if (intent) {
        // Panel and map links skip Next's scroll handling; see map/arrival.ts.
        scrollOnArrival(intent, layout, frameRef.current);
        arrivalFocusRef.current = { kind: "heading", onlyIfVisible: false };
      } else if (adopted || mountedByNavigationRef.current) {
        // Any other client-side navigation, such as an "Explore …" link on a bean page.
        arrivalFocusRef.current = { kind: "heading", onlyIfVisible: true };
      }
    }

    return () => {
      cancelled = true;
      clearTimeout(readyTimer);
      clearTimeout(intentTimer);
      bindingsRef.current = null;
      anchorRef.current = null;
      layout?.removeAttribute("data-pending");
      const current = handle;
      handle = null;
      handleRef.current = null;
      if (!current) {
        host?.remove();
        return;
      }
      current.ui = null;
      try {
        setHoveredIso(current, null);
        current.map.getCanvas().style.cursor = "";
        for (const entry of current.layer.entries.values()) entry.element.removeAttribute("data-linked");
      } finally {
        // Always dispose or park, even if the map misbehaved above.
        if (current.ready && !current.lost) park(current);
        else discard(current);
      }
    };
  }, []);

  // Bring layers, markers and camera in line with the current props.
  useEffect(() => {
    viewRef.current = view;
    const handle = handleRef.current;
    const slot = slotRef.current;
    if (status === "ready" && handle && slot) {
      showView(handle, view, slot, !prefersReducedMotion());
      // Drop the tooltip and hover outline only when their marker left.
      const anchor = anchorRef.current;
      if (anchor?.kind === "marker" && !view.markers.some((marker) => marker.key === anchor.key)) {
        anchorRef.current = null;
        setTooltip(null);
        setHoveredIso(handle, null);
      }
    }
    const arrival = arrivalFocusRef.current;
    if (arrival) {
      // Right after the first sync, which may have blurred a marker that left. Not deferred to a
      // frame: on a busy main thread that leaves a gap in which Tab starts from the top of the page.
      // A marker that survived the navigation keeps focus.
      arrivalFocusRef.current = null;
      if (arrival.kind === "link") focusLink(arrival.href, arrival.index);
      else if (arrival.kind === "marker") focusMarker(arrival.key);
      else focusHeading(slot?.closest<HTMLElement>("[data-explore-layout]") ?? null, arrival.onlyIfVisible);
    }
  }, [status, view]);

  // Document-level listeners, independent of the map's state: explore links
  // start an intent on click, and list entries highlight their marker and
  // outline on hover or focus (no tooltip).
  useEffect(() => {
    let linked: { key: string; element: HTMLElement | null; iso: string | null } | null = null;

    const unlink = () => {
      if (!linked) return;
      linked.element?.removeAttribute("data-linked");
      const handle = handleRef.current;
      if (handle && linked.iso && handle.hoveredIso === linked.iso) setHoveredIso(handle, null);
      linked = null;
    };

    const link = (key: string) => {
      unlink();
      const handle = handleRef.current;
      const entry = handle?.layer.entries.get(key);
      const shown = entry && !entry.leaving ? entry : undefined;
      // A marker on the far side of the globe stays hidden; its outline still tints.
      const element = shown && !shown.element.classList.contains("maplibregl-marker-covered") ? shown.element : null;
      element?.setAttribute("data-linked", "");
      // A country without coordinates has no marker, but its outline can still tint.
      const iso = shown
        ? shown.spec.kind === "country"
          ? shown.spec.iso
          : null
        : (handle?.view?.curated.find((outline) => mapKey(outline.countryId) === key)?.iso ?? null);
      if (handle && iso) setHoveredIso(handle, iso);
      linked = { key, element, iso };
    };

    const keyedLink = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>("[data-map-key]") : null;

    const onEnter = (event: Event) => {
      // Touch has no hover: pointerover fires on every touchstart, including the start of a scroll.
      // A tap still links through focusin.
      if (event instanceof PointerEvent && event.pointerType === "touch") return;
      const element = keyedLink(event.target);
      const key = element?.dataset.mapKey;
      if (!element || !key || key === linked?.key) return;
      const href = element.getAttribute("href");
      if (href) routerRef.current.prefetch(href, FULL_PREFETCH);
      link(key);
    };

    const onLeave = (event: PointerEvent | FocusEvent) => {
      const element = keyedLink(event.target);
      if (!element || element.dataset.mapKey !== linked?.key) return;
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      unlink();
    };

    // Capture phase, before Next's <Link> handles the click; never prevents it.
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.defaultPrevented) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // A new navigation supersedes a Back/Forward that hasn't arrived (where entries have no keys).
      traversedTo = null;
      // Remember the link (bean and drink cards too, below the layout) so Back can focus it again,
      // and which of the links with its href it was (a breadcrumb and a "Back to …" link share one).
      const href = anchor.getAttribute("href");
      if (href && anchor.closest("main")) {
        const same = [...document.querySelectorAll(`main a[href="${CSS.escape(href)}"]`)];
        returnFocus.set(entryKey(), { href, index: Math.max(0, same.indexOf(anchor)) });
      } else returnFocus.delete(entryKey());
      if (!url.pathname.startsWith("/explore")) return;
      unlink();
      bindingsRef.current?.startIntent(url.href, anchor.closest("[data-explore-layout]") ? "panel" : "other");
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerover", onEnter);
    document.addEventListener("focusin", onEnter);
    document.addEventListener("pointerout", onLeave);
    document.addEventListener("focusout", onLeave);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerover", onEnter);
      document.removeEventListener("focusin", onEnter);
      document.removeEventListener("pointerout", onLeave);
      document.removeEventListener("focusout", onLeave);
      unlink();
    };
  }, []);

  const hasCurated = view.curated.length > 0;
  const hasMarkers = view.markers.length > 0;
  const hasSelected = view.markers.some((marker) => marker.selected);
  const place = captionPlace(countries, regions, focus);
  // Pages list every country (and, below the world view, every region) next to the map.
  const errorMessage = countries.length > 0 ? ERROR_MESSAGE_WITH_LIST : ERROR_MESSAGE;

  return (
    <section aria-label={label} aria-busy={status === "loading"} className={styles.root} data-map-state={status}>
      <div ref={frameRef} className={styles.frame} data-state={status} data-level={view.level}>
        <div ref={slotRef} className={styles.canvas} />

        {/* Always rendered; explore-map.module.css fades it out once the map is ready. */}
        <div className={styles.skeleton} data-level={view.level} aria-hidden="true">
          <div className={styles.skeletonGlobe} />
          <span className={styles.skeletonCaption}>Loading the map</span>
        </div>

        <p role="status" className={status === "error" ? styles.message : styles.statusIdle}>
          {status === "error" ? errorMessage : ""}
        </p>

        {status === "ready" && tooltip ? (
          <div
            className={tooltip.below ? `${styles.tooltip} ${styles.tooltipBelow}` : styles.tooltip}
            style={{ left: tooltip.x, top: tooltip.y }}
            aria-hidden="true"
          >
            <span className={styles.tooltipTitle}>{tooltip.title}</span>
            <span className={styles.tooltipDetail}>{tooltip.detail}</span>
          </div>
        ) : null}
      </div>

      {status !== "error" ? (
        <ul className={styles.caption} aria-label="Map legend">
          {place ? (
            <li className={styles.captionPlace} aria-hidden="true">
              {place}
            </li>
          ) : null}
          {hasCurated ? (
            <li className={styles.legendItem}>
              <span className={styles.swatch} aria-hidden="true" />
              Countries with curated content
            </li>
          ) : null}
          {hasMarkers && view.level === "world" ? (
            <li className={styles.legendItem}>
              <span className={styles.legendDot} aria-hidden="true" />
              Country guide, sized by content
            </li>
          ) : null}
          {hasMarkers && view.level !== "world" ? (
            <li className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendDotRegion}`} aria-hidden="true" />
              Region guide
            </li>
          ) : null}
          {hasSelected ? (
            <li className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendDotSelected}`} aria-hidden="true" />
              Selected region
            </li>
          ) : null}
          {view.level === "world" ? (
            <li className={styles.legendItem}>
              <span className={styles.legendTropics} aria-hidden="true" />
              Tropics, the coffee belt
            </li>
          ) : null}
          <li className={styles.credits}>
            Outlines{" "}
            <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">
              Natural Earth
            </a>{" "}
            · Map{" "}
            <a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">
              MapLibre
            </a>
          </li>
        </ul>
      ) : null}
    </section>
  );
}
