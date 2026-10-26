import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type CatalogSnapshot, catalogSnapshotSchema } from "@/contracts";
import { getMapPreviewCatalog } from "@/modules/map-experience/dev/preview-catalog";
import { indexCatalog } from "@/modules/map-experience/lib/catalog-view";
import { toMapCountries, toMapRegions } from "@/modules/map-experience/lib/map-model";
import { buildMapView } from "@/modules/map-experience/ui/map/view";

afterEach(() => vi.unstubAllEnvs());

function enabledPreview(): CatalogSnapshot {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ENABLE_DEV_FIXTURES", "true");
  const snapshot = getMapPreviewCatalog();
  if (!snapshot) throw new Error("Expected the preview catalog behind an open development gate.");
  return snapshot;
}

function duplicates(ids: readonly string[]): string[] {
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}

function allSourceIds(snapshot: CatalogSnapshot): string[] {
  return [
    ...snapshot.countries,
    ...snapshot.regions,
    ...snapshot.beans,
    ...snapshot.drinks,
    ...snapshot.pairings,
  ].flatMap((record) => record.sourceIds);
}

describe("map preview catalog gate", () => {
  it.each([
    ["production", "true"],
    ["production", "false"],
    ["test", "true"],
    ["test", "false"],
    ["development", "false"],
    ["development", "TRUE"],
    ["development", ""],
  ])("returns null for NODE_ENV=%s and ENABLE_DEV_FIXTURES=%s", (nodeEnv, flag) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("ENABLE_DEV_FIXTURES", flag);
    expect(getMapPreviewCatalog()).toBeNull();
  });

  it("returns a fresh copy on every call", () => {
    const first = enabledPreview();
    const second = enabledPreview();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.countries).not.toBe(first.countries);
  });
});

describe("map preview catalog content", () => {
  it("is valid against the shared catalog contract", () => {
    const snapshot = enabledPreview();
    expect(catalogSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("has a small but non-trivial sample in every collection", () => {
    const snapshot = enabledPreview();
    expect(snapshot.countries.length).toBeGreaterThanOrEqual(8);
    expect(snapshot.regions.length).toBeGreaterThanOrEqual(12);
    expect(snapshot.beans.length).toBeGreaterThanOrEqual(12);
    expect(snapshot.drinks.length).toBeGreaterThanOrEqual(8);
    expect(snapshot.pairings.length).toBeGreaterThanOrEqual(4);
  });

  it("uses unique IDs within each collection", () => {
    const snapshot = enabledPreview();
    for (const records of [
      snapshot.countries,
      snapshot.regions,
      snapshot.beans,
      snapshot.drinks,
      snapshot.pairings,
      snapshot.sources,
    ]) {
      expect(duplicates(records.map((record) => record.id))).toEqual([]);
    }
  });

  it("keeps every reference resolvable", () => {
    const snapshot = enabledPreview();
    const countryIds = new Set(snapshot.countries.map((country) => country.id));
    const regionsById = new Map(snapshot.regions.map((region) => [region.id, region]));
    const beanIds = new Set(snapshot.beans.map((bean) => bean.id));
    const drinkIds = new Set(snapshot.drinks.map((drink) => drink.id));
    const sourceIds = new Set(snapshot.sources.map((source) => source.id));

    for (const region of snapshot.regions) expect(countryIds.has(region.countryId), region.id).toBe(true);

    const locations = [
      ...snapshot.beans.map((bean) => ({ owner: bean.id, place: bean.origin })),
      ...snapshot.drinks.flatMap((drink) => drink.associatedLocations.map((place) => ({ owner: drink.id, place }))),
    ];
    for (const { owner, place } of locations) {
      expect(countryIds.has(place.countryId), owner).toBe(true);
      if (place.regionId !== null) {
        // The region must exist and belong to the same country.
        expect(regionsById.get(place.regionId)?.countryId, owner).toBe(place.countryId);
      }
    }

    for (const pairing of snapshot.pairings) {
      expect(beanIds.has(pairing.beanId), pairing.id).toBe(true);
      expect(drinkIds.has(pairing.drinkId), pairing.id).toBe(true);
    }

    const unresolved = allSourceIds(snapshot).filter((id) => !sourceIds.has(id));
    expect(unresolved).toEqual([]);
  });

  it("cites every source at least once", () => {
    const snapshot = enabledPreview();
    const cited = new Set(allSourceIds(snapshot));
    expect(snapshot.sources.filter((source) => !cited.has(source.id)).map((source) => source.id)).toEqual([]);
  });

  it("has exactly one list-only region without coordinates", () => {
    const snapshot = enabledPreview();
    expect(snapshot.regions.filter((region) => region.center === null).map((region) => region.id)).toEqual([
      "indonesia-java",
    ]);
    // Countries all carry an outline code and a map center.
    for (const country of snapshot.countries) {
      expect(country.isoCode, country.id).not.toBeNull();
      expect(country.center, country.id).not.toBeNull();
    }
  });

  it("matches every country to an outline in the bundled base map", () => {
    const snapshot = enabledPreview();
    const geojson = JSON.parse(readFileSync(new URL("../../public/map/countries.geojson", import.meta.url), "utf8")) as {
      features: { properties: { iso: string } }[];
    };
    const outlines = new Set(geojson.features.map((feature) => feature.properties.iso));
    for (const country of snapshot.countries) expect(outlines.has(country.isoCode ?? ""), country.id).toBe(true);
  });

  it("separates drink association from bean origin", () => {
    const snapshot = enabledPreview();
    const originCountries = new Set(snapshot.beans.map((bean) => bean.origin.countryId));
    const places = snapshot.drinks.flatMap((drink) => drink.associatedLocations);

    expect(places.some((place) => place.regionId === null)).toBe(true);
    expect(places.some((place) => place.regionId !== null)).toBe(true);
    // At least one drink is associated with a country that grows none of the catalog's beans.
    expect(places.some((place) => !originCountries.has(place.countryId))).toBe(true);
    // At least one bean is recorded at country level only.
    expect(snapshot.beans.some((bean) => bean.origin.regionId === null)).toBe(true);
  });

  it("labels documented and suggested pairings distinctly", () => {
    const snapshot = enabledPreview();
    const documented = snapshot.pairings.filter((pairing) => pairing.relationship === "documented");
    const suggested = snapshot.pairings.filter((pairing) => pairing.relationship === "suggested");
    expect(documented.length).toBeGreaterThanOrEqual(1);
    expect(suggested.length).toBeGreaterThanOrEqual(1);
    expect(documented.length).toBeLessThan(suggested.length);
    for (const pairing of suggested) expect(pairing.explanation, pairing.id).toMatch(/suggest/i);
    for (const pairing of documented) expect(pairing.explanation, pairing.id).toMatch(/^Documented:/);
  });

  it("cites real https sources, never the synthetic example domain", () => {
    const snapshot = enabledPreview();
    for (const source of snapshot.sources) {
      const url = new URL(source.url);
      expect(url.protocol, source.id).toBe("https:");
      expect(url.hostname, source.id).not.toMatch(/(^|\.)example\.(invalid|com|org|net)$/);
      expect(source.url, source.id).not.toContain("example.invalid");
      expect(source.publisher, source.id).not.toBeNull();
      // Checked on 2026-10-16; dead links replaced on 2026-10-20 (see src/modules/catalog/README.md).
      expect(["2026-10-16", "2026-10-20"], source.id).toContain(source.accessedAt);
    }
  });

  it("uses no synthetic fixture IDs", () => {
    const snapshot = enabledPreview();
    const ids = [
      ...snapshot.countries,
      ...snapshot.regions,
      ...snapshot.beans,
      ...snapshot.drinks,
      ...snapshot.pairings,
      ...snapshot.sources,
    ].map((record) => record.id);
    expect(ids.filter((id) => id.startsWith("example-"))).toEqual([]);
  });
});

describe("map preview catalog on the map", () => {
  it("moves Yirgacheffe, Nyeri and Huehuetenango left of their dots", () => {
    const snapshot = enabledPreview();
    const index = indexCatalog(snapshot);
    const left = snapshot.countries.flatMap((entry) =>
      buildMapView(toMapCountries(index), toMapRegions(index, entry.id), { level: "country", countryId: entry.id })
        .markers.filter((marker) => marker.labelSide === "left")
        .map((marker) => marker.name),
    );
    expect(left.sort()).toEqual(["Huehuetenango", "Nyeri", "Yirgacheffe"]);
  });
});
