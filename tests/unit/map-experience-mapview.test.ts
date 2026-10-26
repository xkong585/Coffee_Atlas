import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CountryCollection } from "@/modules/map-experience/lib/geometry";
import { mapKey } from "@/modules/map-experience/lib/links";
import type { MapCountry, MapRegion } from "@/modules/map-experience/lib/map-model";
import {
  applyViewToLayers,
  buildMapStyle,
  CURATED_EDGE_LAYER,
  CURATED_LAYER,
  curatedFilter,
  EMPHASIS_LAYER,
  emphasisFilter,
  FOCUS_OUTLINE_LAYER,
  FOCUS_SHADOW_LAYER,
  focusOutlineFilter,
  graticuleData,
  SWAP_DELAY_MS,
} from "@/modules/map-experience/ui/map/style";
import { buildMapView, focusKeyOf } from "@/modules/map-experience/ui/map/view";

/*
 * Synthetic map data. IDs and names are invented; nothing here is coffee content.
 *
 * test-country-a "Alpha" AA: West Hill and East Hill close together, Far Plain alone, No Center list-only
 * test-country-b "Bravo" BB: Other Hill, right next to West Hill but in another country
 */

const A = "test-country-a";
const B = "test-country-b";

const country = (id: string, name: string, isoCode: string, lng: number, lat: number): MapCountry => ({
  id,
  name,
  isoCode,
  center: { longitude: lng, latitude: lat },
  regionCount: 2,
  beanCount: 1,
  drinkCount: 1,
});

const region = (id: string, countryId: string, name: string, center: [number, number] | null): MapRegion => ({
  id,
  countryId,
  name,
  center: center && { longitude: center[0], latitude: center[1] },
  beanCount: 1,
  drinkCount: 0,
});

const countries = [country(A, "Alpha", "AA", 38, 8), country(B, "Bravo", "BB", -80, 10)];
const regions = [
  region("test-region-west", A, "West Hill", [38.2, 6.16]),
  region("test-region-east", A, "East Hill", [38.5, 6.7]),
  region("test-region-far", A, "Far Plain", [42, 9]),
  region("test-region-none", A, "No Center", null),
  region("test-region-other", B, "Other Hill", [38.3, 6.2]),
];

const sides = (view: ReturnType<typeof buildMapView>) =>
  Object.fromEntries(view.markers.map((marker) => [marker.name, marker.labelSide]));

describe("map view: label sides", () => {
  it("gives country markers no label side", () => {
    const view = buildMapView(countries, [], { level: "world" });
    expect(view.markers.map((marker) => marker.labelSide)).toEqual([null, null]);
  });

  it("puts the western name of a close pair on the left and the rest on the right", () => {
    const view = buildMapView(countries, regions, { level: "region", countryId: A, regionId: "test-region-far" });
    // Other Hill is in another country, so it is not on this map and never pushes a name aside.
    expect(sides(view)).toEqual({ "East Hill": "right", "Far Plain": "right", "West Hill": "left" });
  });

  it("keeps an isolated region's name on the right", () => {
    const view = buildMapView(countries, [region("test-region-far", A, "Far Plain", [42, 9])], { level: "country", countryId: A });
    expect(sides(view)).toEqual({ "Far Plain": "right" });
  });

});

describe("map view: focus and keys", () => {
  it("tints the focused country fully on its page and softly on a region page, and nothing at world level", () => {
    const world = buildMapView(countries, regions, { level: "world" });
    expect(world.emphasizedIso).toBeNull();
    expect(world.focusedIso).toBeNull();
    const country = buildMapView(countries, regions, { level: "country", countryId: A });
    expect(country.emphasizedIso).toBe("AA");
    expect(country.emphasisOpacity).toBe(1);
    const region = buildMapView(countries, regions, { level: "region", countryId: A, regionId: "test-region-far" });
    expect(region.focusedIso).toBe("AA");
    expect(region.emphasizedIso).toBe("AA");
    expect(region.emphasisOpacity).toBeGreaterThan(0);
    expect(region.emphasisOpacity).toBeLessThan(country.emphasisOpacity);
  });

  it("keys markers and focuses the way panel links do (mapKey)", () => {
    const world = buildMapView(countries, regions, { level: "world" });
    expect(world.markers.map((marker) => marker.key)).toEqual([mapKey(A), mapKey(B)]);
    const region = buildMapView(countries, regions, { level: "region", countryId: A, regionId: "test-region-far" });
    expect(region.focusKey).toBe(mapKey(A, "test-region-far"));
    expect(region.markers.map((marker) => marker.key)).toContain(mapKey(A, "test-region-west"));
    expect(focusKeyOf({ level: "country", countryId: A })).toBe(mapKey(A));
    expect(focusKeyOf({ level: "world" })).toBe("world");
  });

  it("keeps only the focused country's regions when given every region (the world page passes all)", () => {
    const view = buildMapView(countries, regions, { level: "country", countryId: B });
    expect(view.markers.map((marker) => marker.name)).toEqual(["Other Hill"]);
    expect(buildMapView(countries, regions, { level: "world" }).markers.every((marker) => marker.kind === "country")).toBe(true);
  });
});

describe("map style: graticule", () => {
  const { features } = graticuleData();
  const grid = features.filter((feature) => feature.properties.kind === "grid");
  const tropics = features.filter((feature) => feature.properties.kind === "tropic");
  const isMeridian = (coordinates: [number, number][]) => coordinates.every(([lng]) => lng === coordinates[0][0]);

  it("draws meridians every 30° and five parallels", () => {
    const meridians = grid.filter((feature) => isMeridian(feature.geometry.coordinates));
    expect(meridians.map((feature) => feature.geometry.coordinates[0][0])).toEqual([
      -180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150,
    ]);
    for (const meridian of meridians) {
      expect(meridian.geometry.coordinates[0][1]).toBe(-80);
      expect(meridian.geometry.coordinates.at(-1)?.[1]).toBe(80);
    }
    const parallels = grid.filter((feature) => !isMeridian(feature.geometry.coordinates));
    expect(parallels.map((feature) => feature.geometry.coordinates[0][1])).toEqual([-60, -30, 0, 30, 60]);
  });

  it("adds exactly two tropics at ±23.44°, around the whole globe", () => {
    expect(tropics).toHaveLength(2);
    expect(tropics.map((feature) => feature.geometry.coordinates[0][1])).toEqual([-23.44, 23.44]);
    for (const tropic of tropics) {
      expect(tropic.geometry.coordinates[0][0]).toBe(-180);
      expect(tropic.geometry.coordinates.at(-1)?.[0]).toBe(180);
    }
  });
});

describe("map style: layers", () => {
  const outlines: CountryCollection = { type: "FeatureCollection", features: [] };

  it("stacks grid and coast bands under the land, and the shadow and emphasis between curated fill and borders", () => {
    const style = buildMapStyle(outlines, ["AA", "BB"], "AA", "AA");
    expect(style.layers.map((layer) => layer.id)).toEqual([
      "ocean",
      "graticule",
      "coast-shelf",
      "coast-shallows",
      "coast-shore",
      "countries-land",
      CURATED_LAYER,
      FOCUS_SHADOW_LAYER,
      EMPHASIS_LAYER,
      "countries-borders",
      CURATED_EDGE_LAYER,
      "tropics-glow",
      "tropics",
      FOCUS_OUTLINE_LAYER,
    ]);
    expect(Object.keys(style.sources)).toEqual(["countries", "graticule"]);
  });

  it("builds the emphasis at the view's opacity", () => {
    const style = buildMapStyle(outlines, ["AA"], "AA", "AA", { emphasisOpacity: 0.45 });
    const paint = style.layers.find((layer) => layer.id === EMPHASIS_LAYER)?.paint as Record<string, unknown>;
    expect(paint["fill-opacity"]).toBe(0.45);
  });

  it("hides the emphasis and outline when nothing is focused, and drops fades for reduced motion", () => {
    const style = buildMapStyle(outlines, ["AA"], null, null, { reducedMotion: true });
    const paint = (id: string) => style.layers.find((layer) => layer.id === id)?.paint as Record<string, unknown>;
    expect(paint(EMPHASIS_LAYER)["fill-opacity"]).toBe(0);
    expect(paint(EMPHASIS_LAYER)["fill-opacity-transition"]).toEqual({ duration: 0, delay: 0 });
    expect(paint(FOCUS_OUTLINE_LAYER)["line-opacity"]).toBe(0);
    expect(style.transition).toEqual({ duration: 0, delay: 0 });
    expect(buildMapStyle(outlines, ["AA"], "AA", "AA").transition).toEqual({ duration: 300, delay: 0 });
  });
});

type Call = [method: "setFilter" | "setPaintProperty", layer: string, ...args: unknown[]];

/** Records the two map calls applyViewToLayers makes; each fake is a new map to the WeakMap inside. */
function fakeMap() {
  const calls: Call[] = [];
  const map = {
    setFilter: (layer: string, filter: unknown) => {
      calls.push(["setFilter", layer, filter]);
    },
    setPaintProperty: (layer: string, name: string, value: unknown) => {
      calls.push(["setPaintProperty", layer, name, value]);
    },
  };
  return { map: map as unknown as MapLibreMap, calls };
}

const onLayer = (calls: Call[], layer: string) => calls.filter((call) => call[1] === layer);

describe("map style: applying a view to the layers", () => {
  const world = buildMapView(countries, [], { level: "world" });
  const alpha = buildMapView(countries, regions, { level: "country", countryId: A });
  const bravo = buildMapView(countries, [], { level: "country", countryId: B });
  const westHill = buildMapView(countries, regions, { level: "region", countryId: A, regionId: "test-region-west" });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies the curated filter, emphasis and outline at once, then does nothing for the same view", () => {
    const { map, calls } = fakeMap();
    applyViewToLayers(map, alpha, { animate: false });
    expect(calls).toEqual([
      ["setFilter", CURATED_LAYER, curatedFilter(["AA", "BB"])],
      ["setFilter", CURATED_EDGE_LAYER, curatedFilter(["AA", "BB"])],
      ["setFilter", EMPHASIS_LAYER, emphasisFilter("AA")],
      ["setPaintProperty", EMPHASIS_LAYER, "fill-opacity", 1],
      ["setFilter", FOCUS_OUTLINE_LAYER, focusOutlineFilter("AA")],
      ["setPaintProperty", FOCUS_OUTLINE_LAYER, "line-opacity", 0.9],
      ["setFilter", FOCUS_SHADOW_LAYER, focusOutlineFilter("AA")],
      ["setPaintProperty", FOCUS_SHADOW_LAYER, "line-opacity", 0.16],
    ]);
    applyViewToLayers(map, alpha, { animate: false });
    applyViewToLayers(map, alpha, { animate: true });
    expect(calls).toHaveLength(8);
  });

  it("applies the first call for a map at once, even when asked to animate", () => {
    vi.useFakeTimers();
    const { map, calls } = fakeMap();
    applyViewToLayers(map, world, { animate: true });
    expect(onLayer(calls, EMPHASIS_LAYER)).toEqual([
      ["setFilter", EMPHASIS_LAYER, emphasisFilter(null)],
      ["setPaintProperty", EMPHASIS_LAYER, "fill-opacity", 0],
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fades a country in at once when none was shown", () => {
    vi.useFakeTimers();
    const { map, calls } = fakeMap();
    applyViewToLayers(map, world, { animate: false });
    calls.length = 0;
    applyViewToLayers(map, alpha, { animate: true });
    expect(onLayer(calls, EMPHASIS_LAYER)).toEqual([
      ["setFilter", EMPHASIS_LAYER, emphasisFilter("AA")],
      ["setPaintProperty", EMPHASIS_LAYER, "fill-opacity", 1],
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fades the old country out before the new one fades in", () => {
    vi.useFakeTimers();
    const { map, calls } = fakeMap();
    applyViewToLayers(map, alpha, { animate: false });
    calls.length = 0;

    applyViewToLayers(map, bravo, { animate: true });
    expect(calls).toEqual([
      ["setPaintProperty", EMPHASIS_LAYER, "fill-opacity", 0],
      ["setPaintProperty", FOCUS_OUTLINE_LAYER, "line-opacity", 0],
      ["setPaintProperty", FOCUS_SHADOW_LAYER, "line-opacity", 0],
    ]);
    vi.advanceTimersByTime(SWAP_DELAY_MS - 1);
    expect(calls).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(calls.slice(3)).toEqual([
      ["setFilter", EMPHASIS_LAYER, emphasisFilter("BB")],
      ["setPaintProperty", EMPHASIS_LAYER, "fill-opacity", 1],
      ["setFilter", FOCUS_OUTLINE_LAYER, focusOutlineFilter("BB")],
      ["setPaintProperty", FOCUS_OUTLINE_LAYER, "line-opacity", 0.9],
      ["setFilter", FOCUS_SHADOW_LAYER, focusOutlineFilter("BB")],
      ["setPaintProperty", FOCUS_SHADOW_LAYER, "line-opacity", 0.16],
    ]);
  });

  it("softens the tint in place on a region page and keeps the outline", () => {
    vi.useFakeTimers();
    const { map, calls } = fakeMap();
    applyViewToLayers(map, alpha, { animate: false });
    calls.length = 0;

    // Country → region: the same country, a softer tint, no filter swap and no timer.
    applyViewToLayers(map, westHill, { animate: true });
    expect(calls).toEqual([["setPaintProperty", EMPHASIS_LAYER, "fill-opacity", westHill.emphasisOpacity]]);
    expect(vi.getTimerCount()).toBe(0);

    // And back to the full tint on the country page.
    applyViewToLayers(map, alpha, { animate: true });
    expect(calls.slice(1)).toEqual([["setPaintProperty", EMPHASIS_LAYER, "fill-opacity", 1]]);
  });

  it("lets a newer call cancel a pending swap", () => {
    vi.useFakeTimers();
    const { map, calls } = fakeMap();
    applyViewToLayers(map, alpha, { animate: false });
    calls.length = 0;

    // Toward Bravo: Alpha fades out and the swap waits.
    applyViewToLayers(map, bravo, { animate: true });
    expect(calls).toHaveLength(3);

    // Back to Alpha before the swap: the swap is dropped and Alpha fades back in.
    applyViewToLayers(map, alpha, { animate: true });
    vi.runAllTimers();
    expect(calls.slice(3)).toEqual([
      ["setPaintProperty", EMPHASIS_LAYER, "fill-opacity", 1],
      ["setPaintProperty", FOCUS_OUTLINE_LAYER, "line-opacity", 0.9],
      ["setPaintProperty", FOCUS_SHADOW_LAYER, "line-opacity", 0.16],
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
