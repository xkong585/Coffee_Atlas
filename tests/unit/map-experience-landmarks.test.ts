import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MapCountry, MapRegion } from "@/modules/map-experience/lib/map-model";
import { markerDiameter } from "@/modules/map-experience/ui/map/labels";
import { COUNTRY_LANDMARKS, landmarkFame, landmarkFor, REGION_LANDMARKS } from "@/modules/map-experience/ui/map/landmarks";
import { buildMapView } from "@/modules/map-experience/ui/map/view";

const country = (id: string, name: string, isoCode: string): MapCountry => ({
  id,
  name,
  isoCode,
  center: { latitude: 8, longitude: 38 },
  regionCount: 1,
  beanCount: 1,
  drinkCount: 0,
});
const region = (id: string, countryId: string, longitude: number): MapRegion => ({
  id,
  countryId,
  name: id,
  center: { latitude: 8, longitude },
  beanCount: 1,
  drinkCount: 0,
});

describe("map landmarks", () => {
  it("has a landmark for every preview country, and every illustration exists under public/", () => {
    for (const iso of ["ET", "KE", "CO", "BR", "GT", "ID", "VN", "YE", "TR", "IT"]) expect(COUNTRY_LANDMARKS[iso]).toBeDefined();
    for (const landmark of [...Object.values(COUNTRY_LANDMARKS), ...Object.values(REGION_LANDMARKS)]) {
      expect(landmark.name).not.toBe("");
      expect(landmark.src).toMatch(/^\/map\/landmarks\/[a-z-]+\.svg$/);
      expect(existsSync(join(process.cwd(), "public", landmark.src))).toBe(true);
    }
  });

  it("prefers the region's own landmark, then the country's, then none", () => {
    expect(landmarkFor("ET", "ethiopia-harar")).toBe(REGION_LANDMARKS["ethiopia-harar"]);
    expect(landmarkFor("ET", "ethiopia-sidama")).toBe(COUNTRY_LANDMARKS.ET);
    expect(landmarkFor("ET")).toBe(COUNTRY_LANDMARKS.ET);
    expect(landmarkFor("ZZ", "unknown")).toBeNull();
    expect(landmarkFor(null)).toBeNull();
  });

  it("gives country markers their landmark, and leaves unknown countries without one", () => {
    const countries = [country("ethiopia", "Ethiopia", "ET"), country("nowhere", "Nowhere", "ZZ")];
    const { markers } = buildMapView(countries, [], { level: "world" });
    expect(markers.find((m) => m.name === "Ethiopia")).toMatchObject({ landmark: COUNTRY_LANDMARKS.ET, diameter: markerDiameter(2) });
    expect(markers.find((m) => m.name === "Nowhere")).toMatchObject({ landmark: null, diameter: markerDiameter(2) });
  });

  it("gives region markers their own landmark or their country's", () => {
    const countries = [country("ethiopia", "Ethiopia", "ET")];
    const regions = [region("ethiopia-harar", "ethiopia", 42), region("ethiopia-sidama", "ethiopia", 38)];
    const { markers } = buildMapView(countries, regions, { level: "country", countryId: "ethiopia" });
    expect(markers.find((m) => m.name === "ethiopia-harar")?.landmark).toBe(REGION_LANDMARKS["ethiopia-harar"]);
    expect(markers.find((m) => m.name === "ethiopia-sidama")?.landmark).toBe(COUNTRY_LANDMARKS.ET);
  });

  it("ranks famous landmarks first when illustrations crowd", () => {
    expect(landmarkFame(COUNTRY_LANDMARKS.FR)).toBeLessThan(landmarkFame(COUNTRY_LANDMARKS.ET));
    expect(landmarkFame(COUNTRY_LANDMARKS.ET)).toBeLessThan(landmarkFame(COUNTRY_LANDMARKS.BI));
    expect(landmarkFame(REGION_LANDMARKS["ethiopia-harar"])).toBe(landmarkFame(COUNTRY_LANDMARKS.BI));
  });
});
