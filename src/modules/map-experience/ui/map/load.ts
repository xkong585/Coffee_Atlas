import { type CountryCollection, isCountryCollection } from "@/modules/map-experience/lib/geometry";

/** Client-only loaders for the map library and the bundled outlines. Never call these during server rendering. */

export type MapLibreModule = typeof import("maplibre-gl");

export const COUNTRIES_URL = "/map/countries.geojson";

let countriesRequest: Promise<CountryCollection> | null = null;

/** Fetches the Natural Earth outlines once per page session; a failed request can be retried later. */
export function loadCountries(): Promise<CountryCollection> {
  if (!countriesRequest) {
    countriesRequest = fetch(COUNTRIES_URL, { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Country outlines responded with ${response.status}`);
        const data: unknown = await response.json();
        if (!isCountryCollection(data)) throw new Error("Country outlines are not a GeoJSON feature collection");
        return data;
      })
      .catch((error: unknown) => {
        countriesRequest = null;
        throw error;
      });
  }
  return countriesRequest;
}

let mapLibreRequest: Promise<MapLibreModule> | null = null;

/**
 * Lazy-loads MapLibre once per page session; a failed chunk load can be retried later.
 * The package is a UMD bundle, so bundlers may expose it as the default export.
 */
export function loadMapLibre(): Promise<MapLibreModule> {
  if (!mapLibreRequest) {
    mapLibreRequest = import("maplibre-gl")
      .then((loaded) => {
        const lib = loaded as MapLibreModule & { default?: MapLibreModule };
        return typeof lib.Map === "function" ? lib : (lib.default as MapLibreModule);
      })
      .catch((error: unknown) => {
        mapLibreRequest = null;
        throw error;
      });
  }
  return mapLibreRequest;
}

/** Starts both downloads early (before the map mounts); failures surface again when the map asks for them. */
export function warmMapResources(): void {
  if (typeof window === "undefined") return;
  loadMapLibre().catch(() => {});
  loadCountries().catch(() => {});
}

let webgl: boolean | null = null;

/**
 * True when the browser can create a WebGL context (MapLibre needs WebGL 1 or 2).
 * Probed once per tab; a negative answer is remembered too.
 */
export function webglSupported(): boolean {
  if (webgl === null) {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      // Release the probe context right away; browsers cap the number of live contexts.
      context?.getExtension("WEBGL_lose_context")?.loseContext();
      webgl = context !== null;
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Touch-first devices: markers get larger hit areas there (see explore-map.module.css). */
export function prefersCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
}
