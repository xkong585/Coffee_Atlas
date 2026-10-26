import type {
  FilterSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
  Map as MapLibreMap,
  StyleSpecification,
} from "maplibre-gl";
import type { CountryCollection, LngLatTuple } from "@/modules/map-experience/lib/geometry";
import type { MapView } from "./view";

/**
 * The map's inline MapLibre style. Everything is drawn from the bundled
 * Natural Earth outlines and a generated graticule: no tile, glyph or sprite
 * servers, therefore no symbol (text) layers. Names live in HTML markers,
 * tooltips and the lists.
 */

/**
 * Colors for an editorial atlas: a deep sea-green ocean that lightens toward
 * the coasts, warm paper land in a few close tones so neighbours read apart,
 * and olive greens for curated and focused countries.
 * ocean and curated have CSS twins (--map-ocean, --map-curated in
 * explore-map.module.css) for the loading panel and the legend; WebGL paint
 * can't read CSS variables, so keep both in sync.
 */
export const MAP_COLORS = {
  ocean: "#b9cdca",
  shelf: ["#c4d6d2", "#cfdfda", "#dce8e3"],
  land: ["#f7f3ea", "#f2ede1", "#f5efe3", "#efe9db"],
  border: "#cfc5b0",
  graticule: "#4f6b68",
  curated: "#b9c79b",
  curatedHover: "#a6b787",
  curatedEdge: "#7e8d63",
  focused: "#93a86f",
  focusedOutline: "#4e5c3f",
  focusShadow: "#2f3a26",
} as const;

export const COUNTRIES_SOURCE = "countries";
export const GRATICULE_SOURCE = "graticule";
export const CURATED_LAYER = "countries-curated";
export const CURATED_EDGE_LAYER = "countries-curated-edge";
export const EMPHASIS_LAYER = "countries-emphasis";
export const FOCUS_OUTLINE_LAYER = "countries-focus-outline";
export const FOCUS_SHADOW_LAYER = "countries-focus-shadow";

/** Opacity of the focus outline while it shows a country. */
const OUTLINE_OPACITY = 0.9;
/** Opacity of the soft shadow under the focused country. */
const SHADOW_OPACITY = 0.16;
/** Fade of the emphasis fill and focus outline; the swap waits until the old country has nearly faded. */
const FADE_MS = 220;
export const SWAP_DELAY_MS = 200;

type FillLayer = Extract<LayerSpecification, { type: "fill" }>;
type FillColor = NonNullable<NonNullable<FillLayer["paint"]>["fill-color"]>;

/** Only countries with curated content are drawn (and clickable) in the curated layer. */
export function curatedFilter(isoCodes: readonly string[]): FilterSpecification {
  return ["in", ["get", "iso"], ["literal", [...isoCodes]]];
}

/** Curated countries darken on hover (feature-state). The emphasized country has its own layer above. */
export function curatedFillColor(): FillColor {
  return ["case", ["boolean", ["feature-state", "hover"], false], MAP_COLORS.curatedHover, MAP_COLORS.curated];
}

export function emphasisFilter(emphasizedIso: string | null): FilterSpecification {
  return ["==", ["get", "iso"], emphasizedIso ?? ""];
}

export function focusOutlineFilter(focusedIso: string | null): FilterSpecification {
  return ["==", ["get", "iso"], focusedIso ?? ""];
}

interface GraticuleLine {
  type: "Feature";
  /** "tropic" for the Tropics of Cancer and Capricorn (the coffee belt), "grid" for the rest. */
  properties: { kind: "grid" | "tropic" };
  geometry: { type: "LineString"; coordinates: LngLatTuple[] };
}

export interface GraticuleCollection {
  type: "FeatureCollection";
  features: GraticuleLine[];
}

const TROPIC_LATITUDE = 23.44;

/** Points every 2° from `from` to `to` (inclusive), so lines stay smooth on the globe. */
function steps(from: number, to: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value += 2) values.push(value);
  return values;
}

/** Meridians every 30°, parallels every 30° up to ±60°, and the two tropics. Pure, so it can be unit tested. */
export function graticuleData(): GraticuleCollection {
  const line = (kind: GraticuleLine["properties"]["kind"], coordinates: LngLatTuple[]): GraticuleLine => ({
    type: "Feature",
    properties: { kind },
    geometry: { type: "LineString", coordinates },
  });
  const features: GraticuleLine[] = [];
  for (let lng = -180; lng < 180; lng += 30) {
    features.push(line("grid", steps(-80, 80).map((lat): LngLatTuple => [lng, lat])));
  }
  for (const lat of [-60, -30, 0, 30, 60]) {
    features.push(line("grid", steps(-180, 180).map((lng): LngLatTuple => [lng, lat])));
  }
  for (const lat of [-TROPIC_LATITUDE, TROPIC_LATITUDE]) {
    features.push(line("tropic", steps(-180, 180).map((lng): LngLatTuple => [lng, lat])));
  }
  return { type: "FeatureCollection", features };
}

/** Coast bands from the widest (outermost) to the narrowest; widths at zoom 0, 3 and 6. */
const SHORE_BANDS = [
  { id: "coast-shelf", color: MAP_COLORS.shelf[0], width: [6, 14, 34] },
  { id: "coast-shallows", color: MAP_COLORS.shelf[1], width: [3.5, 8, 19] },
  { id: "coast-shore", color: MAP_COLORS.shelf[2], width: [1.5, 3.5, 8] },
] as const;

/** Four close paper tones, picked per country from its name so neighbours rarely match. */
const landColor = [
  "match",
  ["%", ["length", ["to-string", ["get", "name"]]], 4],
  0,
  MAP_COLORS.land[0],
  1,
  MAP_COLORS.land[1],
  2,
  MAP_COLORS.land[2],
  MAP_COLORS.land[3],
] as unknown as FillColor;

export function buildMapStyle(
  countries: CountryCollection,
  curatedIsoCodes: readonly string[],
  focusedIso: string | null,
  emphasizedIso: string | null,
  options: { reducedMotion?: boolean; emphasisOpacity?: number } = {},
): StyleSpecification {
  const fade = { duration: options.reducedMotion ? 0 : FADE_MS, delay: 0 };
  return {
    version: 8,
    projection: { type: "globe" },
    // No atmosphere glow: on the light page it reads as a white crescent, not as air. The
    // globe's shadow is drawn in CSS behind the canvas instead (explore-map.module.css).
    sky: { "atmosphere-blend": 0 },
    transition: { duration: options.reducedMotion ? 0 : 300, delay: 0 },
    sources: {
      [COUNTRIES_SOURCE]: {
        type: "geojson",
        data: countries as unknown as GeoJSONSourceSpecification["data"],
        // Hover state is keyed by ISO code, so every part of a country highlights together.
        promoteId: "iso",
        tolerance: 0.45,
      },
      [GRATICULE_SOURCE]: {
        type: "geojson",
        data: graticuleData() as unknown as GeoJSONSourceSpecification["data"],
      },
    },
    layers: [
      { id: "ocean", type: "background", paint: { "background-color": MAP_COLORS.ocean } },
      // Under the land fill, so the grid only shows over water, and only on the globe.
      {
        id: "graticule",
        type: "line",
        source: GRATICULE_SOURCE,
        filter: ["!=", ["get", "kind"], "tropic"],
        maxzoom: 4.5,
        paint: {
          "line-color": MAP_COLORS.graticule,
          "line-width": 0.6,
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.22, 3, 0.1, 4.5, 0],
        },
      },
      // Shallow water: three bands along every coast, lighter toward the shore, like an atlas's
      // water lines. Not blurred: line-blur draws spikes at sharp coastline corners.
      ...SHORE_BANDS.map(
        (band): LayerSpecification => ({
          id: band.id,
          type: "line",
          source: COUNTRIES_SOURCE,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": band.color,
            "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 0, band.width[0], 3, band.width[1], 6, band.width[2]],
          },
        }),
      ),
      { id: "countries-land", type: "fill", source: COUNTRIES_SOURCE, paint: { "fill-color": landColor } },
      {
        id: CURATED_LAYER,
        type: "fill",
        source: COUNTRIES_SOURCE,
        filter: curatedFilter(curatedIsoCodes),
        paint: { "fill-color": curatedFillColor() },
      },
      // A soft offset shadow under the focused country, so it sits above its neighbours.
      {
        id: FOCUS_SHADOW_LAYER,
        type: "line",
        layout: { "line-join": "round", "line-cap": "round" },
        source: COUNTRIES_SOURCE,
        filter: focusOutlineFilter(focusedIso),
        paint: {
          "line-color": MAP_COLORS.focusShadow,
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 2, 6, 5],
          "line-translate": [1.5, 2.5],
          "line-opacity": focusedIso ? SHADOW_OPACITY : 0,
          "line-opacity-transition": fade,
        },
      },
      // The focused country (softer on region pages). A layer of its own so it can fade in and out.
      {
        id: EMPHASIS_LAYER,
        type: "fill",
        source: COUNTRIES_SOURCE,
        filter: emphasisFilter(emphasizedIso),
        paint: {
          "fill-color": MAP_COLORS.focused,
          "fill-opacity": emphasizedIso ? (options.emphasisOpacity ?? 1) : 0,
          "fill-opacity-transition": fade,
        },
      },
      {
        id: "countries-borders",
        type: "line",
        source: COUNTRIES_SOURCE,
        paint: {
          "line-color": MAP_COLORS.border,
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.35, 4, 0.8, 7, 1.2],
        },
      },
      // Curated countries get a crisper olive edge than ordinary borders.
      {
        id: CURATED_EDGE_LAYER,
        type: "line",
        source: COUNTRIES_SOURCE,
        filter: curatedFilter(curatedIsoCodes),
        paint: {
          "line-color": MAP_COLORS.curatedEdge,
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.4, 4, 0.9, 7, 1.3],
          "line-opacity": 0.7,
        },
      },
      // The tropics, edging the coffee belt: a warm glow under a dashed line, fading out as the map zooms in.
      {
        id: "tropics-glow",
        type: "line",
        layout: { "line-join": "round", "line-cap": "round" },
        source: GRATICULE_SOURCE,
        filter: ["==", ["get", "kind"], "tropic"],
        maxzoom: 5,
        paint: {
          "line-color": "#d9a35f",
          "line-width": 7,
          "line-blur": 6,
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.3, 3.5, 0.12, 5, 0],
        },
      },
      {
        id: "tropics",
        type: "line",
        source: GRATICULE_SOURCE,
        filter: ["==", ["get", "kind"], "tropic"],
        maxzoom: 5,
        paint: {
          "line-color": "#865039",
          "line-width": 0.8,
          "line-dasharray": [2, 3],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.5, 3.5, 0.25, 5, 0],
        },
      },
      {
        id: FOCUS_OUTLINE_LAYER,
        type: "line",
        source: COUNTRIES_SOURCE,
        filter: focusOutlineFilter(focusedIso),
        paint: {
          "line-color": MAP_COLORS.focusedOutline,
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.9, 6, 1.8],
          "line-opacity": focusedIso ? OUTLINE_OPACITY : 0,
          "line-opacity-transition": fade,
        },
      },
    ],
  };
}

interface FadingLayer {
  id: string;
  opacity: "fill-opacity" | "line-opacity";
  filter: (iso: string | null) => FilterSpecification;
}

const EMPHASIS_FADE: FadingLayer = { id: EMPHASIS_LAYER, opacity: "fill-opacity", filter: emphasisFilter };
const OUTLINE_FADE: FadingLayer = { id: FOCUS_OUTLINE_LAYER, opacity: "line-opacity", filter: focusOutlineFilter };
const SHADOW_FADE: FadingLayer = { id: FOCUS_SHADOW_LAYER, opacity: "line-opacity", filter: focusOutlineFilter };

interface FadeState {
  /** The country last asked for; undefined before the first call. */
  target: string | null | undefined;
  /** The opacity it was asked for at. */
  targetOpacity: number | undefined;
  /** The country the layer's filter matches right now. */
  shown: string | null | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
}

interface LayerSync {
  curatedKey: string | null;
  emphasis: FadeState;
  outline: FadeState;
  shadow: FadeState;
}

/** Same check as in load.ts, kept local so the style module only depends on geometry and view types. */
const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** What each live map was last given, so repeated calls with the same view do nothing. */
const appliedViews = new WeakMap<MapLibreMap, LayerSync>();

function fadeTo(
  map: MapLibreMap,
  layer: FadingLayer,
  state: FadeState,
  iso: string | null,
  opacity: number,
  animate: boolean,
) {
  if (state.target === iso && state.targetOpacity === opacity) return;
  clearTimeout(state.timer);
  state.timer = undefined;
  state.target = iso;
  state.targetOpacity = opacity;

  const show = () => {
    state.timer = undefined;
    if (state.shown !== iso) map.setFilter(layer.id, layer.filter(iso));
    state.shown = iso;
    map.setPaintProperty(layer.id, layer.opacity, iso ? opacity : 0);
  };

  // Nothing (or the same country, perhaps at a new opacity) is on screen: show it right away, fading.
  if (!animate || !state.shown || state.shown === iso) {
    show();
    return;
  }
  // Fade the old country out, then swap the filter and fade the new one in.
  map.setPaintProperty(layer.id, layer.opacity, 0);
  state.timer = setTimeout(() => {
    try {
      show();
    } catch {
      // The map was removed while the old country faded out; there is nothing left to update.
    }
  }, SWAP_DELAY_MS);
}

/**
 * Brings the curated filter, the emphasized fill and the focus outline in line
 * with a view. With `animate`, a country that changes fades out before the
 * next one fades in, and the same country fades to a new opacity in place
 * (country → region page); a newer call cancels a pending swap. The first call for
 * a map applies at once (the style was built from the same view), and calls
 * with an unchanged view do nothing.
 */
export function applyViewToLayers(map: MapLibreMap, view: MapView, options: { animate: boolean }): void {
  let sync = appliedViews.get(map);
  const first = !sync;
  if (!sync) {
    sync = {
      curatedKey: null,
      emphasis: { target: undefined, targetOpacity: undefined, shown: undefined, timer: undefined },
      outline: { target: undefined, targetOpacity: undefined, shown: undefined, timer: undefined },
      shadow: { target: undefined, targetOpacity: undefined, shown: undefined, timer: undefined },
    };
    appliedViews.set(map, sync);
  }

  const curatedIsoCodes = view.curated.map((entry) => entry.iso);
  const curatedKey = curatedIsoCodes.join(",");
  if (sync.curatedKey !== curatedKey) {
    map.setFilter(CURATED_LAYER, curatedFilter(curatedIsoCodes));
    map.setFilter(CURATED_EDGE_LAYER, curatedFilter(curatedIsoCodes));
    sync.curatedKey = curatedKey;
  }

  const animate = options.animate && !first && !reducedMotion();
  fadeTo(map, EMPHASIS_FADE, sync.emphasis, view.emphasizedIso, view.emphasisOpacity, animate);
  fadeTo(map, OUTLINE_FADE, sync.outline, view.focusedIso, OUTLINE_OPACITY, animate);
  fadeTo(map, SHADOW_FADE, sync.shadow, view.focusedIso, SHADOW_OPACITY, animate);
}
