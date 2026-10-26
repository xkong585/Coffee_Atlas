import { describe, expect, it } from "vitest";
import {
  type Bean,
  type CatalogSnapshot,
  type Coordinates,
  type Country,
  catalogSnapshotSchema,
  type Drink,
  type Pairing,
  type Region,
  type Source,
} from "@/contracts";
import {
  beansGrownIn,
  countrySummaries,
  drinksAssociatedWith,
  drinksInCountry,
  hasCoordinates,
  indexCatalog,
  type PairingView,
  pairingsForBean,
  pairingsForDrink,
  regionBelongsToCountry,
  regionSummaries,
  regionsOf,
  resolveLocation,
  sourcesFor,
} from "@/modules/map-experience/lib/catalog-view";
import { toMapCountries, toMapRegions } from "@/modules/map-experience/lib/map-model";

/*
 * Synthetic test catalog. IDs and names are invented; nothing here is coffee content.
 *
 * test-country-a "Alpha"   isoCode AA, has a center
 *   test-region-a-south "South Ridge"  center (5, 21)
 *   test-region-a-north "North Valley" center null (list-only)
 *   test-region-a-east  "east Coast"   center (0, 0), a real coordinate, lowercase name for sorting
 * test-country-b "Bravo"   isoCode null, center null
 *   test-region-b-west  "West Plateau"
 * test-country-c "Charlie" drinks only, no beans or regions
 */

const A = "test-country-a";
const B = "test-country-b";
const C = "test-country-c";
const SOUTH = "test-region-a-south";
const NORTH = "test-region-a-north";
const EAST = "test-region-a-east";
const WEST = "test-region-b-west";

const sources: Source[] = [
  { id: "test-source-one", title: "Test source one", url: "https://example.invalid/one", publisher: "Test Press", accessedAt: "2026-10-16" },
  { id: "test-source-two", title: "Test source two", url: "https://example.invalid/two", publisher: null, accessedAt: "2026-10-16" },
  { id: "test-source-three", title: "Test source three", url: "https://example.invalid/three", publisher: "Test Press", accessedAt: "2026-10-16" },
];

const country = (id: string, name: string, isoCode: string | null, center: Coordinates | null): Country => ({
  id, name, isoCode, center, summary: `${name} summary.`, sourceIds: ["test-source-one"],
});

const region = (id: string, countryId: string, name: string, center: Coordinates | null): Region => ({
  id, countryId, name, center, summary: `${name} summary.`, sourceIds: ["test-source-two"],
});

const bean = (id: string, name: string, countryId: string, regionId: string | null): Bean => ({
  id, name, description: `${name} description.`, origin: { countryId, regionId },
  flavorNotes: [], varieties: [], processingMethods: [], roastDescription: null, growingConditions: null,
  sourceIds: ["test-source-one"],
});

const drink = (id: string, name: string, associatedLocations: Drink["associatedLocations"]): Drink => ({
  id, name, description: `${name} description.`, associatedLocations,
  flavorNotes: [], ingredients: [], preparation: null, culturalContext: null, sourceIds: ["test-source-three"],
});

const pairing = (id: string, beanId: string, drinkId: string, relationship: Pairing["relationship"]): Pairing => ({
  id, beanId, drinkId, relationship, explanation: `${relationship} test pairing.`, sourceIds: ["test-source-one"],
});

function testSnapshot(): CatalogSnapshot {
  return {
    countries: [
      // Deliberately not in name order.
      country(C, "Charlie", "CC", { latitude: -30, longitude: -60 }),
      country(A, "Alpha", "AA", { latitude: 10, longitude: 20 }),
      country(B, "Bravo", null, null),
    ],
    regions: [
      region(SOUTH, A, "South Ridge", { latitude: 5, longitude: 21 }),
      region(NORTH, A, "North Valley", null),
      region(WEST, B, "West Plateau", { latitude: -2, longitude: 33 }),
      region(EAST, A, "east Coast", { latitude: 0, longitude: 0 }),
    ],
    beans: [
      bean("test-bean-south", "Sunrise Lot", A, SOUTH),
      bean("test-bean-country", "Alpha Blend", A, null),
      bean("test-bean-north", "Northern Washed", A, NORTH),
      bean("test-bean-west", "Bravo Natural", B, WEST),
    ],
    drinks: [
      drink("test-drink-ridge", "Ridge Cup", [{ countryId: A, regionId: SOUTH }]),
      // Tied to South Ridge and to Alpha as a whole.
      drink("test-drink-double", "Double Tie", [
        { countryId: A, regionId: SOUTH },
        { countryId: A, regionId: null },
      ]),
      drink("test-drink-alpha", "Alpha Cafe", [{ countryId: A, regionId: null }]),
      drink("test-drink-border", "Border Brew", [
        { countryId: A, regionId: NORTH },
        { countryId: B, regionId: null },
      ]),
      drink("test-drink-west", "West Pour", [{ countryId: B, regionId: WEST }]),
      drink("test-drink-charlie", "Charlie Espresso", [{ countryId: C, regionId: null }]),
    ],
    pairings: [
      pairing("test-pairing-documented", "test-bean-south", "test-drink-double", "documented"),
      pairing("test-pairing-suggested", "test-bean-south", "test-drink-charlie", "suggested"),
      pairing("test-pairing-missing-drink", "test-bean-south", "test-drink-missing", "suggested"),
      pairing("test-pairing-missing-bean", "test-bean-missing", "test-drink-double", "documented"),
      pairing("test-pairing-other", "test-bean-west", "test-drink-alpha", "suggested"),
    ],
    sources,
  };
}

const names = (records: readonly { name: string }[]) => records.map((record) => record.name);
const pairingIds = (views: readonly PairingView[]) => views.map((view) => view.pairing.id);

describe("test catalog fixture", () => {
  it("is valid against the shared catalog contract", () => {
    expect(catalogSnapshotSchema.safeParse(testSnapshot()).success).toBe(true);
  });
});

describe("indexCatalog", () => {
  it("indexes every collection by ID and keeps the original snapshot", () => {
    const snapshot = testSnapshot();
    const index = indexCatalog(snapshot);
    expect(index.snapshot).toBe(snapshot);
    expect([...index.countries.keys()]).toEqual([C, A, B]);
    expect(index.regions.get(EAST)?.name).toBe("east Coast");
    expect(index.beans.get("test-bean-north")?.origin).toEqual({ countryId: A, regionId: NORTH });
    expect(index.drinks.size).toBe(6);
    expect(index.sources.get("test-source-two")?.publisher).toBeNull();
  });

  it("keeps the first record when an ID is duplicated", () => {
    const base = testSnapshot();
    const index = indexCatalog({
      ...base,
      countries: [...base.countries, country(A, "Alpha Impostor", "ZZ", null)],
      regions: [region(SOUTH, B, "Moved Ridge", null), ...base.regions],
      beans: [...base.beans, bean("test-bean-south", "Replacement Lot", B, null)],
      drinks: [...base.drinks, drink("test-drink-ridge", "Replacement Cup", [{ countryId: C, regionId: null }])],
      sources: [...base.sources, { ...sources[0], title: "Replacement source" }],
    });
    expect(index.countries.get(A)?.name).toBe("Alpha");
    expect(index.countries.size).toBe(3);
    // The duplicate came first here, so it is the one that is kept.
    expect(index.regions.get(SOUTH)?.name).toBe("Moved Ridge");
    expect(index.beans.get("test-bean-south")?.name).toBe("Sunrise Lot");
    expect(index.drinks.get("test-drink-ridge")?.name).toBe("Ridge Cup");
    expect(index.sources.get("test-source-one")?.title).toBe("Test source one");
  });
});

describe("hasCoordinates", () => {
  it.each<[string, Coordinates | null | undefined]>([
    ["null", null],
    ["undefined", undefined],
    ["NaN latitude", { latitude: Number.NaN, longitude: 0 }],
    ["NaN longitude", { latitude: 0, longitude: Number.NaN }],
    ["infinite latitude", { latitude: Number.POSITIVE_INFINITY, longitude: 0 }],
    ["negative infinite longitude", { latitude: 0, longitude: Number.NEGATIVE_INFINITY }],
    ["latitude above 90", { latitude: 90.0001, longitude: 0 }],
    ["latitude below -90", { latitude: -91, longitude: 0 }],
    ["longitude above 180", { latitude: 0, longitude: 180.5 }],
    ["longitude below -180", { latitude: 0, longitude: -181 }],
  ])("rejects %s", (_label, center) => {
    expect(hasCoordinates(center)).toBe(false);
  });

  it.each<[string, Coordinates]>([
    ["(0, 0)", { latitude: 0, longitude: 0 }],
    ["the north-east limit", { latitude: 90, longitude: 180 }],
    ["the south-west limit", { latitude: -90, longitude: -180 }],
    ["an ordinary point", { latitude: 12.5, longitude: -45.25 }],
  ])("accepts %s", (_label, center) => {
    expect(hasCoordinates(center)).toBe(true);
  });
});

describe("regions and region membership", () => {
  const index = indexCatalog(testSnapshot());

  it("lists a country's regions by name, case-insensitively, without reordering the snapshot", () => {
    expect(names(regionsOf(index, A))).toEqual(["east Coast", "North Valley", "South Ridge"]);
    expect(names(regionsOf(index, B))).toEqual(["West Plateau"]);
    expect(regionsOf(index, C)).toEqual([]);
    expect(regionsOf(index, "test-country-unknown")).toEqual([]);
    expect(index.snapshot.regions.map((record) => record.id)).toEqual([SOUTH, NORTH, WEST, EAST]);
  });

  it("accepts a region only under its recorded parent country", () => {
    expect(regionBelongsToCountry(index, A, SOUTH)).toBe(true);
    expect(regionBelongsToCountry(index, B, WEST)).toBe(true);
    expect(regionBelongsToCountry(index, B, SOUTH)).toBe(false);
    expect(regionBelongsToCountry(index, A, WEST)).toBe(false);
    expect(regionBelongsToCountry(index, A, "test-region-unknown")).toBe(false);
  });

  it("rejects a region whose parent country is not in the catalog", () => {
    const base = testSnapshot();
    const orphaned = indexCatalog({
      ...base,
      regions: [...base.regions, region("test-region-orphan", "test-country-ghost", "Orphan Hills", null)],
    });
    expect(regionBelongsToCountry(orphaned, "test-country-ghost", "test-region-orphan")).toBe(false);
    expect(regionBelongsToCountry(orphaned, A, "test-region-orphan")).toBe(false);
  });
});

describe("bean origin and drink association", () => {
  const index = indexCatalog(testSnapshot());

  it("lists beans grown anywhere in a country, including country-level origins", () => {
    expect(names(beansGrownIn(index, { countryId: A }))).toEqual(["Alpha Blend", "Northern Washed", "Sunrise Lot"]);
    expect(names(beansGrownIn(index, { countryId: A, regionId: null }))).toEqual([
      "Alpha Blend",
      "Northern Washed",
      "Sunrise Lot",
    ]);
  });

  it("lists only the beans recorded at a region for a region query", () => {
    expect(names(beansGrownIn(index, { countryId: A, regionId: SOUTH }))).toEqual(["Sunrise Lot"]);
    expect(names(beansGrownIn(index, { countryId: A, regionId: NORTH }))).toEqual(["Northern Washed"]);
    expect(beansGrownIn(index, { countryId: A, regionId: EAST })).toEqual([]);
    // A region of another country never matches beans of this one.
    expect(beansGrownIn(index, { countryId: A, regionId: WEST })).toEqual([]);
  });

  it("does not treat drink association as bean origin", () => {
    expect(beansGrownIn(index, { countryId: C })).toEqual([]);
    expect(names(drinksInCountry(index, C))).toEqual(["Charlie Espresso"]);
  });

  it("splits region drinks from country-wide drinks", () => {
    expect(drinksAssociatedWith(index, { countryId: A, regionId: SOUTH })).toEqual({
      region: [index.drinks.get("test-drink-double"), index.drinks.get("test-drink-ridge")],
      countryWide: [index.drinks.get("test-drink-alpha")],
    });
    const north = drinksAssociatedWith(index, { countryId: A, regionId: NORTH });
    expect(names(north.region)).toEqual(["Border Brew"]);
    expect(names(north.countryWide)).toEqual(["Alpha Cafe", "Double Tie"]);
    const west = drinksAssociatedWith(index, { countryId: B, regionId: WEST });
    expect(names(west.region)).toEqual(["West Pour"]);
    expect(names(west.countryWide)).toEqual(["Border Brew"]);
  });

  it("lists a drink tied to both the region and the whole country only once, under the region", () => {
    const south = drinksAssociatedWith(index, { countryId: A, regionId: SOUTH });
    const all = [...south.region, ...south.countryWide].map((record) => record.id);
    expect(all.filter((id) => id === "test-drink-double")).toHaveLength(1);
    expect(south.region.map((record) => record.id)).toContain("test-drink-double");
  });

  it("returns every drink in the country as country-wide when no region is given", () => {
    const result = drinksAssociatedWith(index, { countryId: A });
    expect(result.region).toEqual([]);
    expect(names(result.countryWide)).toEqual(["Alpha Cafe", "Border Brew", "Double Tie", "Ridge Cup"]);
    expect(result.countryWide).toEqual(drinksInCountry(index, A));
  });

  it("lists every drink associated anywhere in a country", () => {
    expect(names(drinksInCountry(index, A))).toEqual(["Alpha Cafe", "Border Brew", "Double Tie", "Ridge Cup"]);
    expect(names(drinksInCountry(index, B))).toEqual(["Border Brew", "West Pour"]);
    expect(drinksInCountry(index, "test-country-unknown")).toEqual([]);
  });
});

describe("pairings", () => {
  const index = indexCatalog(testSnapshot());

  it("groups a bean's pairings into documented and suggested, keeping catalog order", () => {
    const groups = pairingsForBean(index, "test-bean-south");
    expect(pairingIds(groups.documented)).toEqual(["test-pairing-documented"]);
    expect(pairingIds(groups.suggested)).toEqual(["test-pairing-suggested", "test-pairing-missing-drink"]);
    expect(groups.documented[0].bean?.id).toBe("test-bean-south");
    expect(groups.documented[0].drink?.id).toBe("test-drink-double");
    // A cross-country pairing still resolves; pairing does not imply shared origin.
    expect(groups.suggested[0].drink?.associatedLocations).toEqual([{ countryId: C, regionId: null }]);
  });

  it("reports a missing drink counterpart as null", () => {
    const view = pairingsForBean(index, "test-bean-south").suggested.find(
      (entry) => entry.pairing.id === "test-pairing-missing-drink",
    );
    expect(view?.drink).toBeNull();
    expect(view?.bean?.id).toBe("test-bean-south");
  });

  it("groups a drink's pairings and reports a missing bean counterpart as null", () => {
    const groups = pairingsForDrink(index, "test-drink-double");
    expect(pairingIds(groups.documented)).toEqual(["test-pairing-documented", "test-pairing-missing-bean"]);
    expect(groups.suggested).toEqual([]);
    expect(groups.documented[0].bean?.id).toBe("test-bean-south");
    expect(groups.documented[1].bean).toBeNull();
    expect(groups.documented[1].drink?.id).toBe("test-drink-double");
  });

  it("returns empty groups for items without pairings", () => {
    expect(pairingsForBean(index, "test-bean-north")).toEqual({ documented: [], suggested: [] });
    expect(pairingsForDrink(index, "test-drink-unknown")).toEqual({ documented: [], suggested: [] });
  });
});

describe("sourcesFor", () => {
  const index = indexCatalog(testSnapshot());

  it("keeps the requested order, removes duplicates, and reports unknown IDs", () => {
    const lookup = sourcesFor(index, [
      "test-source-three",
      "test-source-unknown",
      "test-source-one",
      "test-source-three",
      "test-source-unknown",
      "test-source-other-unknown",
    ]);
    expect(lookup.found.map((source) => source.id)).toEqual(["test-source-three", "test-source-one"]);
    expect(lookup.missingIds).toEqual(["test-source-unknown", "test-source-other-unknown"]);
  });

  it("returns empty lists for no IDs", () => {
    expect(sourcesFor(index, [])).toEqual({ found: [], missingIds: [] });
  });
});

describe("resolveLocation", () => {
  const index = indexCatalog(testSnapshot());

  it("resolves a country and its region", () => {
    expect(resolveLocation(index, { countryId: A, regionId: SOUTH })).toEqual({
      country: index.countries.get(A),
      region: index.regions.get(SOUTH),
    });
    expect(resolveLocation(index, { countryId: A, regionId: null })).toEqual({
      country: index.countries.get(A),
      region: null,
    });
  });

  it("rejects a region whose recorded parent is a different country", () => {
    expect(resolveLocation(index, { countryId: B, regionId: SOUTH })).toEqual({
      country: index.countries.get(B),
      region: null,
    });
  });

  it("returns null for records missing from the snapshot", () => {
    expect(resolveLocation(index, { countryId: A, regionId: "test-region-unknown" })).toEqual({
      country: index.countries.get(A),
      region: null,
    });
    expect(resolveLocation(index, { countryId: "test-country-unknown", regionId: SOUTH })).toEqual({
      country: null,
      region: null,
    });
  });
});

describe("summaries", () => {
  const index = indexCatalog(testSnapshot());

  it("summarizes countries by name with region, bean and drink counts", () => {
    expect(
      countrySummaries(index).map(({ country: record, regionCount, beanCount, drinkCount }) => ({
        id: record.id,
        regionCount,
        beanCount,
        drinkCount,
      })),
    ).toEqual([
      { id: A, regionCount: 3, beanCount: 3, drinkCount: 4 },
      { id: B, regionCount: 1, beanCount: 1, drinkCount: 2 },
      { id: C, regionCount: 0, beanCount: 0, drinkCount: 1 },
    ]);
  });

  it("summarizes a country's regions, counting only drinks tied to the region", () => {
    expect(
      regionSummaries(index, A).map(({ region: record, beanCount, drinkCount }) => ({
        id: record.id,
        beanCount,
        drinkCount,
      })),
    ).toEqual([
      { id: EAST, beanCount: 0, drinkCount: 0 },
      { id: NORTH, beanCount: 1, drinkCount: 1 },
      { id: SOUTH, beanCount: 1, drinkCount: 2 },
    ]);
    expect(regionSummaries(index, C)).toEqual([]);
  });
});

describe("map model", () => {
  it("builds serializable map countries with counts and keeps missing centers null", () => {
    const countries = toMapCountries(indexCatalog(testSnapshot()));
    expect(countries).toEqual([
      {
        id: A, name: "Alpha", isoCode: "AA", center: { latitude: 10, longitude: 20 },
        regionCount: 3, beanCount: 3, drinkCount: 4,
      },
      { id: B, name: "Bravo", isoCode: null, center: null, regionCount: 1, beanCount: 1, drinkCount: 2 },
      {
        id: C, name: "Charlie", isoCode: "CC", center: { latitude: -30, longitude: -60 },
        regionCount: 0, beanCount: 0, drinkCount: 1,
      },
    ]);
    expect(JSON.parse(JSON.stringify(countries))).toEqual(countries);
  });

  it("builds map regions for one country, keeping a real (0, 0) and a missing center distinct", () => {
    const regions = toMapRegions(indexCatalog(testSnapshot()), A);
    expect(regions).toEqual([
      { id: EAST, countryId: A, name: "east Coast", center: { latitude: 0, longitude: 0 }, beanCount: 0, drinkCount: 0 },
      { id: NORTH, countryId: A, name: "North Valley", center: null, beanCount: 1, drinkCount: 1 },
      { id: SOUTH, countryId: A, name: "South Ridge", center: { latitude: 5, longitude: 21 }, beanCount: 1, drinkCount: 2 },
    ]);
    expect(JSON.parse(JSON.stringify(regions))).toEqual(regions);
    expect(toMapRegions(indexCatalog(testSnapshot()), C)).toEqual([]);
  });

  it("turns unusable coordinates into null rather than (0, 0)", () => {
    const base = testSnapshot();
    const index = indexCatalog({
      ...base,
      countries: base.countries.map((record) =>
        record.id === A ? { ...record, center: { latitude: Number.NaN, longitude: 20 } } : record,
      ),
      regions: base.regions.map((record) =>
        record.id === SOUTH ? { ...record, center: { latitude: 120, longitude: 21 } } : record,
      ),
    });
    expect(toMapCountries(index).find((entry) => entry.id === A)?.center).toBeNull();
    expect(toMapRegions(index, A).find((entry) => entry.id === SOUTH)?.center).toBeNull();
    // Other records are untouched, including the genuine (0, 0) center.
    expect(toMapRegions(index, A).find((entry) => entry.id === EAST)?.center).toEqual({ latitude: 0, longitude: 0 });
    for (const entry of [...toMapCountries(index), ...toMapRegions(index, A)]) {
      if (entry.center !== null) expect(hasCoordinates(entry.center), entry.id).toBe(true);
    }
  });
});
