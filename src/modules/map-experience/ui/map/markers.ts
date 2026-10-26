import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import styles from "../explore-map.module.css";
import { type Landmark, landmarkFame } from "./landmarks";
import type { MapLibreModule } from "./load";
import type { MarkerSpec } from "./view";

export interface MarkerEntry {
  key: string;
  spec: MarkerSpec;
  marker: Marker;
  element: HTMLButtonElement;
  /** Fading out; removed when `removeTimer` fires unless the key comes back first. */
  leaving: boolean;
  removeTimer?: ReturnType<typeof setTimeout>;
}

/** The markers on one map, by `MarkerSpec.key`. */
export interface MarkerLayer {
  entries: Map<string, MarkerEntry>;
}

export interface MarkerHandlers {
  onShow(spec: MarkerSpec): void;
  onHide(spec: MarkerSpec): void;
  onActivate(spec: MarkerSpec, event: MouseEvent): void;
}

/** A little longer than the 150ms leave fade in explore-map.module.css (.marker.leaving), so the fade always finishes. */
const LEAVE_MS = 170;
/** New markers appear when the camera settles, or after this long at the latest. */
const REVEAL_FALLBACK_MS = 1800;

/** Cancels a layer's scheduled reveal of entering markers. */
const pendingReveals = new WeakMap<MarkerLayer, () => void>();

/** The spec a marker currently stands for; leaving markers stand for nothing. */
function currentSpec(layer: MarkerLayer, key: string): MarkerSpec | null {
  const entry = layer.entries.get(key);
  return entry && !entry.leaving ? entry.spec : null;
}

/**
 * Puts `landmark`'s illustration in the dot (or removes it), touching the DOM
 * only when it changes. The image is decorative: the button's label names the place.
 */
function syncArt(dot: HTMLElement, landmark: Landmark | null) {
  const current = dot.querySelector("img");
  if (current?.getAttribute("src") === (landmark?.src ?? null)) return;
  current?.remove();
  if (!landmark) return;
  const img = document.createElement("img");
  img.className = styles.landmark;
  img.src = landmark.src;
  img.alt = "";
  img.decoding = "async";
  img.draggable = false;
  dot.append(img);
}

function sameLngLat(a: MarkerSpec["lngLat"], b: MarkerSpec["lngLat"]) {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Brings the button in line with its spec. Classes are toggled one by one
 * because MapLibre adds its own (`maplibregl-marker`, `-covered`) to the same element.
 */
function applySpec(element: HTMLButtonElement, spec: MarkerSpec) {
  element.classList.toggle(styles.countryMarker, spec.kind === "country");
  element.classList.toggle(styles.regionMarker, spec.kind === "region");
  element.classList.toggle(styles.selected, spec.selected);
  element.setAttribute("aria-label", spec.ariaLabel);
  if (spec.selected) element.setAttribute("aria-current", "location");
  else element.removeAttribute("aria-current");
  element.dataset.mapMarker = spec.key;
  element.style.setProperty("--dot", `${spec.diameter}px`);
  // The landmark stands on the dot, so it moves, fades and scales with it.
  syncArt(element.firstElementChild as HTMLSpanElement, spec.landmark);

  // The name, when there is one, always follows the dot.
  let label = element.firstElementChild?.nextElementSibling as HTMLSpanElement | null | undefined;
  if (!spec.labelSide) {
    label?.remove();
    return;
  }
  if (!label) {
    label = document.createElement("span");
    label.setAttribute("aria-hidden", "true");
    element.append(label);
  }
  label.className = spec.labelSide === "left" ? `${styles.label} ${styles.labelLeft}` : styles.label;
  label.textContent = spec.name;
}

/**
 * A map marker as a plain DOM <button> (MapLibre positions it with CSS
 * transforms, outside React). The button is the focusable, labelled control.
 * With a mouse only the dot (plus a small ring) and the name take clicks, so
 * close markers never steal each other's clicks; touch screens get a 44px target.
 * Listeners look the spec up by key, so updates in place never re-bind them.
 */
function createMarkerElement(layer: MarkerLayer, spec: MarkerSpec, handlers: MarkerHandlers): HTMLButtonElement {
  const { key } = spec;
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add(styles.marker);

  const dot = document.createElement("span");
  dot.className = styles.dot;
  dot.setAttribute("aria-hidden", "true");
  button.append(dot);
  applySpec(button, spec);

  const show = () => {
    const current = currentSpec(layer, key);
    if (current) handlers.onShow(current);
  };
  const hide = () => {
    const current = currentSpec(layer, key);
    if (current) handlers.onHide(current);
  };
  button.addEventListener("mouseenter", show);
  button.addEventListener("focus", show);
  button.addEventListener("mouseleave", () => {
    if (document.activeElement !== button) hide();
  });
  button.addEventListener("blur", hide);
  button.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
  button.addEventListener("click", (event) => {
    // Keep the click from also reaching the country outline underneath.
    event.stopPropagation();
    const current = currentSpec(layer, key);
    if (current) handlers.onActivate(current, event);
  });
  return button;
}

/**
 * Shows every entering marker together: when the camera settles if it is
 * moving, otherwise on the next frame, so the fade starts from the
 * transparent state. A later sync reschedules, so all of them still go at once.
 */
function scheduleReveal(map: MapLibreMap, layer: MarkerLayer) {
  pendingReveals.get(layer)?.();
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    map.off("moveend", reveal);
    pendingReveals.delete(layer);
  };
  const reveal = () => {
    cancel();
    for (const entry of layer.entries.values()) entry.element.classList.remove(styles.entering);
  };
  timer = setTimeout(reveal, REVEAL_FALLBACK_MS);
  if (map.isMoving()) map.once("moveend", reveal);
  else
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(reveal);
    });
  pendingReveals.set(layer, cancel);
}

/** Illustrations may overlap by this much (px) before the less important one steps back. */
const ART_OVERLAP_PX = 8;

/** Layers whose map already re-runs `declutterArt` on every camera move. */
const declutterWired = new WeakSet<MarkerLayer>();

/**
 * Where markers crowd (East Africa, Europe in the world view), only the most
 * important illustration in each cluster stays up; the others keep their dot
 * and come back as the map zooms in and they separate. Importance: the selected
 * marker, then the larger dot (more content), then the better-known landmark.
 */
function declutterArt(map: MapLibreMap, layer: MarkerLayer) {
  const boxes: { left: number; right: number; top: number; bottom: number }[] = [];
  const candidates = [...layer.entries.values()]
    .filter((entry) => !entry.leaving && entry.spec.landmark)
    .sort(
      (a, b) =>
        Number(b.spec.selected) - Number(a.spec.selected) ||
        b.spec.diameter - a.spec.diameter ||
        landmarkFame(a.spec.landmark as Landmark) - landmarkFame(b.spec.landmark as Landmark) ||
        a.spec.name.localeCompare(b.spec.name),
    );
  for (const entry of candidates) {
    const art = entry.element.querySelector("img");
    const covered = entry.element.classList.contains("maplibregl-marker-covered");
    let hide = false;
    if (art && !covered) {
      const { x, y } = map.project(entry.spec.lngLat);
      const half = art.offsetWidth / 2 - ART_OVERLAP_PX;
      const box = { left: x - half, right: x + half, top: y - art.offsetHeight + ART_OVERLAP_PX, bottom: y };
      hide = boxes.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
      if (!hide) boxes.push(box);
    }
    entry.element.classList.toggle(styles.artHidden, hide);
  }
}

function wireDeclutter(map: MapLibreMap, layer: MarkerLayer) {
  declutterArt(map, layer);
  if (declutterWired.has(layer)) return;
  declutterWired.add(layer);
  let frame = 0;
  map.on("move", () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      declutterArt(map, layer);
    });
  });
  map.on("moveend", () => declutterArt(map, layer));
}

function removeEntry(layer: MarkerLayer, entry: MarkerEntry) {
  clearTimeout(entry.removeTimer);
  entry.marker.remove();
  if (layer.entries.get(entry.key) === entry) layer.entries.delete(entry.key);
}

/**
 * Brings the layer in line with `specs`, keyed by `MarkerSpec.key`. Kept
 * markers are updated in place (the same element, so focus survives), new
 * ones fade in and removed ones fade out when `animate` is set.
 */
export function syncMarkers(
  lib: MapLibreModule,
  map: MapLibreMap,
  layer: MarkerLayer,
  specs: readonly MarkerSpec[],
  handlers: MarkerHandlers,
  options: { animate: boolean },
): void {
  const wanted = new Set(specs.map((spec) => spec.key));
  let entering = false;

  for (const entry of [...layer.entries.values()]) {
    if (wanted.has(entry.key) || entry.leaving) continue;
    if (!options.animate) {
      removeEntry(layer, entry);
      continue;
    }
    const { element } = entry;
    entry.leaving = true;
    element.classList.remove(styles.entering);
    element.classList.add(styles.leaving);
    element.inert = true;
    element.tabIndex = -1;
    if (element.contains(document.activeElement)) element.blur();
    entry.removeTimer = setTimeout(() => removeEntry(layer, entry), LEAVE_MS);
  }

  for (const spec of specs) {
    const entry = layer.entries.get(spec.key);
    if (entry) {
      if (entry.leaving) {
        // Back before it was removed: keep the same marker.
        clearTimeout(entry.removeTimer);
        entry.removeTimer = undefined;
        entry.leaving = false;
        entry.element.classList.remove(styles.leaving);
        entry.element.inert = false;
        entry.element.removeAttribute("tabindex");
      }
      if (!sameLngLat(entry.spec.lngLat, spec.lngLat)) entry.marker.setLngLat(spec.lngLat);
      entry.spec = spec;
      applySpec(entry.element, spec);
      continue;
    }
    const element = createMarkerElement(layer, spec, handlers);
    if (options.animate) {
      element.classList.add(styles.entering);
      entering = true;
    }
    const marker = new lib.Marker({ element, anchor: "center", opacityWhenCovered: 0 }).setLngLat(spec.lngLat).addTo(map);
    layer.entries.set(spec.key, { key: spec.key, spec, marker, element, leaving: false });
  }

  if (entering) scheduleReveal(map, layer);
  // After layout, so the illustrations have their size.
  requestAnimationFrame(() => wireDeclutter(map, layer));
}

/** Removes every marker at once (the map is being disposed). */
export function clearMarkers(layer: MarkerLayer): void {
  pendingReveals.get(layer)?.();
  for (const entry of [...layer.entries.values()]) removeEntry(layer, entry);
}
