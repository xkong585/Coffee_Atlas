import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type Bounds,
  type CountryCollection,
  type CountryFeature,
  type LngLatTuple,
  anchoredCenter,
  angularDistance,
  boundsCenter,
  boundsContain,
  clampWorldLatitude,
  clusterBounds,
  countryBounds,
  DEFAULT_WORLD_CENTER,
  featuresForIso,
  globeZoomFor,
  isCountryCollection,
  longitudeArc,
  normalizeIso,
  normalizeLongitude,
  polygonExtents,
  ringExtent,
  worldViewCenter,
} from "@/modules/map-experience/lib/geometry";
import { regionZoom } from "@/modules/map-experience/ui/map/camera";
import { countsLabel, markerAriaLabel, markerDiameter } from "@/modules/map-experience/ui/map/labels";

const square = (west: number, south: number, size: number) => [
  [west, south],
  [west + size, south],
  [west + size, south + size],
  [west, south + size],
  [west, south],
];

const polygon = (iso: string, ring: number[][]): CountryFeature => ({
  type: "Feature",
  properties: { iso, name: iso },
  geometry: { type: "Polygon", coordinates: [ring] },
});

const multiPolygon = (iso: string, rings: number[][][]): CountryFeature => ({
  type: "Feature",
  properties: { iso, name: iso },
  geometry: { type: "MultiPolygon", coordinates: rings.map((ring) => [ring]) },
});

const collection = (...features: CountryFeature[]): CountryCollection => ({ type: "FeatureCollection", features });

const rounded = (bounds: ReturnType<typeof countryBounds>) =>
  bounds?.map((corner) => corner.map((value) => Math.round(value * 10) / 10));

describe("map geometry: ISO lookup", () => {
  it("normalizes ISO codes and rejects Natural Earth's -99 placeholder", () => {
    expect(normalizeIso(" et ")).toBe("ET");
    expect(normalizeIso("-99")).toBeNull();
    expect(normalizeIso("ETH")).toBeNull();
    expect(normalizeIso(null)).toBeNull();
    expect(normalizeIso(42)).toBeNull();
  });

  it("finds every feature of a country and nothing for null or disputed codes", () => {
    const data = collection(polygon("AU", square(110, -40, 40)), polygon("-99", square(0, 0, 1)), polygon("AU", square(155, -20, 1)));
    expect(featuresForIso(data, "au")).toHaveLength(2);
    expect(featuresForIso(data, null)).toEqual([]);
    expect(featuresForIso(data, "-99")).toEqual([]);
    expect(featuresForIso(data, "ZZ")).toEqual([]);
  });

  it("recognizes a feature collection and rejects other JSON", () => {
    expect(isCountryCollection({ type: "FeatureCollection", features: [] })).toBe(true);
    expect(isCountryCollection({ type: "Feature" })).toBe(false);
    expect(isCountryCollection(null)).toBe(false);
    expect(isCountryCollection("FeatureCollection")).toBe(false);
  });
});

describe("map geometry: bounds", () => {
  it("measures a ring and skips invalid points", () => {
    const extent = ringExtent([[10, 0], [12, 0], [Number.NaN, 5], [12, 2], [10, 2], [10, 0]]);
    expect(extent).toMatchObject({ west: 10, east: 12, south: 0, north: 2 });
    expect(extent?.area).toBeCloseTo(4 * Math.cos(Math.PI / 180), 6);
    expect(ringExtent([])).toBeNull();
  });

  it("fits a simple polygon", () => {
    expect(countryBounds(collection(polygon("KE", square(34, -4, 8))), "KE")).toEqual([
      [34, -4],
      [42, 4],
    ]);
  });

  it("joins nearby islands of a multipolygon but leaves out far overseas parts", () => {
    const mainland = square(-5, 42, 10);
    const nearbyIsland = square(8.5, 41.4, 1);
    const overseas = square(-54, 2, 3);
    const bounds = countryBounds(collection(multiPolygon("FR", [overseas, mainland, nearbyIsland])), "FR");
    expect(bounds).toEqual([
      [-5, 41.4],
      [9.5, 52],
    ]);
  });

  it("combines several features with the same ISO code", () => {
    const data = collection(polygon("JP", square(130, 31, 10)), polygon("JP", square(141, 42, 3)));
    expect(countryBounds(data, "JP")).toEqual([
      [130, 31],
      [144, 45],
    ]);
  });

  it("keeps a country that crosses the antimeridian contiguous", () => {
    // A Russia-like outline split at 180°: a large western part and a small eastern tip.
    const west = [[30, 50], [180, 50], [180, 70], [30, 70], [30, 50]];
    const tip = [[-180, 64], [-170, 64], [-170, 68], [-180, 68], [-180, 64]];
    const bounds = countryBounds(collection(multiPolygon("RU", [west, tip])), "RU");
    expect(bounds).toEqual([
      [30, 50],
      [190, 70],
    ]);
    expect(boundsCenter(bounds as NonNullable<typeof bounds>)).toEqual([110, 60]);
  });

  it("chooses the short way around for small island groups on both sides of 180°", () => {
    const eastSide = square(178, -18, 1.5);
    const westSide = square(-180, -17, 1);
    const bounds = countryBounds(collection(multiPolygon("FJ", [eastSide, westSide])), "FJ");
    expect(bounds).toEqual([
      [178, -18],
      [181, -16],
    ]);
    const center = boundsCenter(bounds as NonNullable<typeof bounds>);
    expect(center[0]).toBeCloseTo(179.5);
  });

  it("re-centers bounds whose middle falls west of -180°", () => {
    const main = [[-179, 55], [-170, 55], [-170, 70], [-179, 70], [-179, 55]];
    const thinWesternPart = [[150, 60], [178, 60], [178, 60.5], [150, 60.5], [150, 60]];
    const bounds = clusterBounds(polygonExtents([multiPolygon("XX", [main, thinWesternPart])]));
    expect(bounds).toEqual([
      [150, 55],
      [190, 70],
    ]);
    expect(boundsCenter(bounds as NonNullable<typeof bounds>)).toEqual([170, 62.5]);
  });

  it("clamps polar outlines to latitudes the map can show", () => {
    const ring = [[-180, -90], [180, -90], [180, -60], [-180, -60], [-180, -90]];
    expect(countryBounds(collection(polygon("AQ", ring)), "AQ")).toEqual([
      [-180, -85],
      [180, -60],
    ]);
  });

  it("returns null for unknown outlines and empty geometry", () => {
    const empty: CountryFeature = { type: "Feature", properties: { iso: "XK" }, geometry: null };
    const point: CountryFeature = { type: "Feature", properties: { iso: "SG" }, geometry: { type: "Point" } };
    expect(countryBounds(collection(empty, point), "XK")).toBeNull();
    expect(countryBounds(collection(empty, point), "SG")).toBeNull();
    expect(countryBounds(collection(), "ET")).toBeNull();
    expect(clusterBounds([])).toBeNull();
  });
});

describe("map geometry: bundled Natural Earth outlines", () => {
  const path = fileURLToPath(new URL("../../public/map/countries.geojson", import.meta.url));
  const data: unknown = JSON.parse(readFileSync(path, "utf8"));

  it("is a feature collection with iso and name properties", () => {
    expect(isCountryCollection(data)).toBe(true);
    const features = (data as CountryCollection).features;
    expect(features.length).toBeGreaterThan(200);
    expect(features.every((feature) => typeof feature.properties?.name === "string")).toBe(true);
  });

  it("fits coffee countries, overseas territories and antimeridian countries sensibly", () => {
    const outlines = data as CountryCollection;
    expect(rounded(countryBounds(outlines, "ET"))).toEqual([
      [33, 3.5],
      [48, 14.9],
    ]);
    // Mainland France without French Guiana or Réunion.
    const france = countryBounds(outlines, "FR");
    expect(france?.[0][0]).toBeGreaterThan(-6);
    expect(france?.[0][1]).toBeGreaterThan(40);
    // Mainland Ecuador without the Galápagos.
    expect(countryBounds(outlines, "EC")?.[0][0]).toBeGreaterThan(-82);
    // Russia continues across 180° instead of spanning the whole globe.
    const russia = countryBounds(outlines, "RU");
    expect(russia?.[1][0]).toBeGreaterThan(180);
    expect((russia?.[1][0] ?? 0) - (russia?.[0][0] ?? 0)).toBeLessThan(200);
    // New Zealand includes the Chatham Islands east of 180°.
    expect(countryBounds(outlines, "NZ")?.[1][0]).toBeGreaterThan(180);
  });

  it("tells regions inside the fitted part of a country from far ones", () => {
    const outlines = data as CountryCollection;
    const inside = (iso: string, point: LngLatTuple) => {
      const bounds = countryBounds(outlines, iso);
      return bounds !== null && boundsContain(bounds, point, 0.5);
    };
    expect(inside("ET", [42.12, 9.31])).toBe(true); // Harar
    expect(inside("EC", [-89.5, -0.9])).toBe(false); // San Cristóbal, Galápagos
    expect(inside("ES", [-15.66, 28.08])).toBe(false); // Agaete, Gran Canaria
    expect(inside("FR", [55.5, -21.1])).toBe(false); // Réunion
  });
});

describe("map geometry: world view", () => {
  it("wraps longitudes into [-180, 180)", () => {
    expect(normalizeLongitude(190)).toBe(-170);
    expect(normalizeLongitude(-190)).toBe(170);
    expect(normalizeLongitude(180)).toBe(-180);
    expect(normalizeLongitude(-0)).toBe(0);
    expect(normalizeLongitude(45)).toBe(45);
  });

  it("finds the smallest longitude arc, also across 180°", () => {
    expect(longitudeArc([10, 40, 20])).toEqual([10, 40]);
    expect(longitudeArc([170, -170, 175])).toEqual([170, 190]);
    expect(longitudeArc([])).toBeNull();
  });

  it("faces curated places that fit in one hemisphere", () => {
    expect(worldViewCenter([[39, 9], [37, 0], [30, -2]])).toEqual([34.5, 7 / 3]);
    expect(worldViewCenter([])).toEqual(DEFAULT_WORLD_CENTER);
    expect(worldViewCenter([[10, 80]])).toEqual([10, 30]);
  });

  it("turns a wide spread of places toward where they read best", () => {
    // The coffee belt from Guatemala to Indonesia (the preview's country centers), too wide for one hemisphere.
    const ethiopia: LngLatTuple = [40.49, 9.15];
    const kenya: LngLatTuple = [37.91, 0.02];
    const yemen: LngLatTuple = [48.52, 15.55];
    const belt: LngLatTuple[] = [
      ethiopia,
      kenya,
      [-74.3, 4.57],
      [-51.93, -14.24],
      [-90.23, 15.78],
      [113.92, -0.79],
      [108.28, 14.06],
      yemen,
      [35.24, 38.96],
      [12.57, 41.87],
    ];
    const center = worldViewCenter(belt);
    expect(center[0]).toBe(55);
    expect(center[1]).toBeCloseTo(12.493, 3);
    // East Africa and Yemen in the middle, Europe and South-East Asia framing them.
    for (const place of [ethiopia, kenya, yemen]) expect(angularDistance(center, place)).toBeLessThan(25);
  });

  it("prefers a group near the middle over more places on the rim", () => {
    // Counting places within view would face 100°, keeping four of five near the edge.
    expect(worldViewCenter([[40, 0], [45, 0], [50, 0], [-100, 0], [170, 0]])).toEqual([45, 0]);
  });

  it("measures great-circle angles", () => {
    expect(angularDistance([0, 0], [90, 0])).toBeCloseTo(90);
    expect(angularDistance([170, 0], [-170, 0])).toBeCloseTo(20);
    expect(angularDistance([12, 90], [-77, 90])).toBeCloseTo(0);
  });

  it("sizes the globe to the viewport within limits", () => {
    // 600 px tall viewport: camera 900 px away; a 240 px disc radius needs a globe radius of ~312 px.
    expect(globeZoomFor(900, 600)).toBeCloseTo(1.939, 2);
    expect(globeZoomFor(360, 460)).toBeLessThan(globeZoomFor(900, 600));
    expect(globeZoomFor(900, 600, 0.8, 40)).toBeLessThan(globeZoomFor(900, 600));
    expect(globeZoomFor(0, 0)).toBe(1.3);
    expect(globeZoomFor(10_000, 10_000)).toBe(2.6);
    expect(globeZoomFor(40, 40)).toBe(0.2);
  });
});

describe("map geometry: zooming about a region", () => {
  // Web Mercator x/y in world units, as MapLibre lays out the flat map.
  const mercator = ([lng, lat]: LngLatTuple) => {
    const sine = Math.sin((lat * Math.PI) / 180);
    return [(lng + 180) / 360, 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)];
  };
  /** Where `point` sits on screen relative to the center of a camera at `center`, in pixels. */
  const offset = (point: LngLatTuple, center: LngLatTuple, zoom: number) => {
    const [px, py] = mercator(point);
    const [cx, cy] = mercator(center);
    const scale = 512 * 2 ** zoom;
    return [(px - cx) * scale, (py - cy) * scale];
  };

  it("keeps the region where it was on screen while zooming in", () => {
    const country: LngLatTuple = [39.6, 8.6];
    const harar: LngLatTuple = [42.1, 9.3];
    const before = offset(harar, country, 4.9);
    const after = offset(harar, anchoredCenter(country, harar, 0.5), 5.4);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
  });

  it("moves the center halfway toward the region for a whole step, and not at all for none", () => {
    const [lng, lat] = anchoredCenter([40, 9], [42, 9], 1);
    expect(lng).toBeCloseTo(41, 9);
    expect(lat).toBeCloseTo(9, 9);
    const same = anchoredCenter([40, 9], [42, 9], 0);
    expect(same[0]).toBeCloseTo(40, 9);
    expect(same[1]).toBeCloseTo(9, 9);
  });

  it("leaves a region at the center where it is", () => {
    const [lng, lat] = anchoredCenter([38, 7], [38, 7], 0.75);
    expect(lng).toBeCloseTo(38, 9);
    expect(lat).toBeCloseTo(7, 9);
  });

  it("goes the short way across the antimeridian", () => {
    const center = anchoredCenter([179, -17], [-179, -17], 1);
    expect(angularDistance(center, [180, -17])).toBeLessThan(1e-6);
  });

  it("keeps the center for a step that isn't a number", () => {
    expect(anchoredCenter([40, 9], [42, 9], Number.NaN)).toEqual([40, 9]);
  });

  it("tells whether a point is inside a bounds value, round the globe and within a margin", () => {
    const spain: Bounds = [
      [-9, 36],
      [4, 44],
    ];
    expect(boundsContain(spain, [-3, 40])).toBe(true);
    expect(boundsContain(spain, [-15.66, 28.08])).toBe(false);
    expect(boundsContain(spain, [4.3, 44.2])).toBe(false);
    expect(boundsContain(spain, [4.3, 44.2], 0.5)).toBe(true);
    // A box across the antimeridian (east above 180) contains points on both sides of it.
    const fiji: Bounds = [
      [170, -50],
      [190, -30],
    ];
    expect(boundsContain(fiji, [-175, -40])).toBe(true);
    expect(boundsContain(fiji, [175, -40])).toBe(true);
    expect(boundsContain(fiji, [-165, -40])).toBe(false);
    expect(boundsContain(fiji, [160, -40])).toBe(false);
  });

  it("zooms a region view half a step past the country fit, and at most one step to reach the floor", () => {
    expect(regionZoom(2.14)).toBeCloseTo(3.14, 9); // Brazil on a phone: one step, not up to 4
    expect(regionZoom(3.11)).toBe(4); // Brazil on a wide screen: up to the floor
    expect(regionZoom(5)).toBe(5.5);
    expect(regionZoom(6)).toBe(6); // A small country already fitted at the cap
  });

  it("keeps the world view's latitude near the coffee belt", () => {
    expect(clampWorldLatitude(-40)).toBe(-20);
    expect(clampWorldLatitude(45)).toBe(30);
    expect(clampWorldLatitude(5)).toBe(5);
  });
});

describe("map labels", () => {
  it("describes counts with singular and plural forms", () => {
    expect(countsLabel({ regionCount: 3, beanCount: 1, drinkCount: 2 })).toEqual(["3 regions", "1 bean", "2 drinks"]);
    expect(countsLabel({ beanCount: 2, drinkCount: 1 })).toEqual(["2 beans", "1 drink"]);
  });

  it("leaves out zero counts and says when nothing is recorded", () => {
    expect(countsLabel({ regionCount: 0, beanCount: 0, drinkCount: 2 })).toEqual(["2 drinks"]);
    expect(countsLabel({ regionCount: 1, beanCount: 0, drinkCount: 0 })).toEqual(["1 region"]);
    expect(countsLabel({ regionCount: 0, beanCount: 0, drinkCount: 0 })).toEqual(["Nothing recorded yet"]);
  });

  it("builds marker labels for assistive technology", () => {
    expect(markerAriaLabel("Ethiopia", { regionCount: 3, beanCount: 3, drinkCount: 2 })).toBe(
      "Ethiopia — 3 regions, 3 beans, 2 drinks",
    );
    expect(markerAriaLabel("Sidama", { beanCount: 1, drinkCount: 1 }, "Ethiopia")).toBe("Sidama, Ethiopia — 1 bean, 1 drink");
    expect(markerAriaLabel("Italy", { regionCount: 0, beanCount: 0, drinkCount: 2 })).toBe("Italy — 2 drinks");
  });

  it("grows markers with content but keeps them within limits", () => {
    expect(markerDiameter(0)).toBe(12);
    expect(markerDiameter(4)).toBeGreaterThan(markerDiameter(1));
    expect(markerDiameter(10_000)).toBe(24);
  });
});
