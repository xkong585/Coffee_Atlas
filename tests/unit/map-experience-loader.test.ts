import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ApiResult,
  type Bean,
  type CatalogSnapshot,
  type Drink,
  type ErrorCode,
  success,
  unavailable,
} from "@/contracts";
import { services } from "@/lib/server/services";
import { getMapPreviewCatalog } from "@/modules/map-experience/dev/preview-catalog";
import type { CatalogIndex } from "@/modules/map-experience/lib/catalog-view";
import { loadBean, loadCatalog, loadDrink } from "@/modules/map-experience/server/catalog-loader";

/*
 * The real development gate (NODE_ENV=development and ENABLE_DEV_FIXTURES=true)
 * still decides whether preview data may be used. Only the records behind the
 * open gate are replaced by this file's synthetic test catalog.
 */
vi.mock("@/modules/map-experience/dev/preview-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/map-experience/dev/preview-catalog")>();
  return {
    getMapPreviewCatalog: vi.fn(() => (actual.getMapPreviewCatalog() === null ? null : testSnapshot())),
  };
});

const A = "test-country-a";
const B = "test-country-b";
const SOUTH = "test-region-a-south";
const NORTH = "test-region-a-north";
const WEST = "test-region-b-west";

function testSnapshot(): CatalogSnapshot {
  const sourceIds = ["test-source-one"];
  const country = (id: string, name: string) => ({
    id, name, isoCode: null, center: null, summary: `${name} summary.`, sourceIds,
  });
  const region = (id: string, countryId: string, name: string) => ({
    id, countryId, name, center: { latitude: 1, longitude: 2 }, summary: `${name} summary.`, sourceIds,
  });
  const bean = (id: string, countryId: string, regionId: string | null): Bean => ({
    id, name: id, description: `${id} description.`, origin: { countryId, regionId },
    flavorNotes: ["test note"], varieties: [], processingMethods: [], roastDescription: null,
    growingConditions: null, sourceIds,
  });
  const drink = (id: string, associatedLocations: Drink["associatedLocations"]): Drink => ({
    id, name: id, description: `${id} description.`, associatedLocations, flavorNotes: [],
    ingredients: ["coffee"], preparation: null, culturalContext: null, sourceIds: ["test-source-two"],
  });
  const pairing = (id: string, beanId: string, drinkId: string, relationship: "documented" | "suggested") => ({
    id, beanId, drinkId, relationship, explanation: `${relationship} test pairing.`, sourceIds,
  });
  return {
    countries: [country(A, "Alpha"), country(B, "Bravo")],
    regions: [region(SOUTH, A, "South Ridge"), region(NORTH, A, "North Valley"), region(WEST, B, "West Plateau")],
    beans: [
      bean("test-bean-south", A, SOUTH),
      bean("test-bean-country", A, null),
      bean("test-bean-north", A, NORTH),
      bean("test-bean-west", B, WEST),
    ],
    drinks: [
      drink("test-drink-south", [{ countryId: A, regionId: SOUTH }]),
      drink("test-drink-alpha", [{ countryId: A, regionId: null }]),
      drink("test-drink-north", [{ countryId: A, regionId: NORTH }]),
      drink("test-drink-west", [{ countryId: B, regionId: WEST }]),
      drink("test-drink-shared", [
        { countryId: B, regionId: null },
        { countryId: A, regionId: SOUTH },
      ]),
    ],
    pairings: [
      pairing("test-pairing-south-west", "test-bean-south", "test-drink-west", "suggested"),
      pairing("test-pairing-west-alpha", "test-bean-west", "test-drink-alpha", "suggested"),
      pairing("test-pairing-north-north", "test-bean-north", "test-drink-north", "documented"),
      pairing("test-pairing-west-west", "test-bean-west", "test-drink-west", "documented"),
    ],
    sources: [
      { id: "test-source-one", title: "Test source one", url: "https://example.invalid/one", publisher: null, accessedAt: "2026-10-16" },
      { id: "test-source-two", title: "Test source two", url: "https://example.invalid/two", publisher: "Test Press", accessedAt: "2026-10-16" },
    ],
  };
}

function testBean(id: string): Bean {
  const record = testSnapshot().beans.find((entry) => entry.id === id);
  if (!record) throw new Error(`No test bean ${id}`);
  return record;
}

function testDrink(id: string): Drink {
  const record = testSnapshot().drinks.find((entry) => entry.id === id);
  if (!record) throw new Error(`No test drink ${id}`);
  return record;
}

const failure = (code: ErrorCode): ApiResult<never> => ({
  ok: false,
  error: { code, message: `Test ${code}.`, retryable: false },
});


function openGate() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ENABLE_DEV_FIXTURES", "true");
}

const CLOSED_GATES: [string, string][] = [
  ["production", "true"],
  ["production", "false"],
  ["test", "true"],
  ["development", "false"],
  ["development", "TRUE"],
  ["development", ""],
];

const previewSource = vi.mocked(getMapPreviewCatalog);

beforeEach(() => {
  // Closed unless a test opens it.
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ENABLE_DEV_FIXTURES", "false");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("loadCatalog", () => {
  it("returns the validated service snapshot, not preview data, when the catalog is ready", async () => {
    openGate();
    const list = vi.spyOn(services.catalog, "list").mockResolvedValue(success(testSnapshot()));
    const load = await loadCatalog();
    expect(list).toHaveBeenCalledWith({});
    expect(load.status).toBe("ready");
    if (load.status !== "ready") return;
    expect(load.preview).toBe(false);
    expect(load.index.snapshot).toEqual(testSnapshot());
    expect(load.index.countries.get(A)?.name).toBe("Alpha");
    expect(previewSource).not.toHaveBeenCalled();
  });

  it.each<[string, (snapshot: CatalogSnapshot) => unknown]>([
    ["an out-of-range center", (s) => ({ ...s, countries: [{ ...s.countries[0], center: { latitude: 120, longitude: 0 } }] })],
    ["an unknown field", (s) => ({ ...s, countries: [{ ...s.countries[0], population: 1 }] })],
    ["a missing collection", ({ sources: _sources, ...rest }) => rest],
    ["a non-HTTP source URL", (s) => ({ ...s, sources: [{ ...s.sources[0], url: "ftp://example.invalid/one" }] })],
    ["a record without sources", (s) => ({ ...s, beans: [{ ...s.beans[0], sourceIds: [] }] })],
    ["an invalid ID", (s) => ({ ...s, beans: [{ ...s.beans[0], id: "Test_Bean" }] })],
    ["no snapshot at all", () => null],
  ])("reports an error for a service snapshot with %s, without falling back to preview data", async (_label, corrupt) => {
    openGate();
    vi.spyOn(services.catalog, "list").mockResolvedValue(success(corrupt(testSnapshot()) as CatalogSnapshot));
    expect(await loadCatalog()).toEqual({ status: "error" });
    expect(previewSource).not.toHaveBeenCalled();
  });

  it.each(CLOSED_GATES)(
    "reports unavailable when the service is unavailable and NODE_ENV=%s, ENABLE_DEV_FIXTURES=%s",
    async (nodeEnv, flag) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("ENABLE_DEV_FIXTURES", flag);
      vi.spyOn(services.catalog, "list").mockResolvedValue(unavailable("Catalog"));
      expect(await loadCatalog()).toEqual({ status: "unavailable" });
    },
  );

  it("uses the labeled preview catalog when the service is unavailable and the development gate is open", async () => {
    openGate();
    vi.spyOn(services.catalog, "list").mockResolvedValue(unavailable("Catalog"));
    const load = await loadCatalog();
    expect(load.status).toBe("ready");
    if (load.status !== "ready") return;
    expect(load.preview).toBe(true);
    expect(load.index.snapshot).toEqual(testSnapshot());
    expect(previewSource).toHaveBeenCalled();
  });

  it.each<ErrorCode>(["INVALID_INPUT", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "INTERNAL_ERROR"])(
    "reports an error for %s and never substitutes preview data",
    async (code) => {
      openGate();
      vi.spyOn(services.catalog, "list").mockResolvedValue(failure(code));
      expect(await loadCatalog()).toEqual({ status: "error" });
      expect(previewSource).not.toHaveBeenCalled();
    },
  );

  it("reports a generic error when the service rejects or throws", async () => {
    vi.spyOn(services.catalog, "list").mockRejectedValueOnce(new Error("private-provider-debug-detail"));
    expect(await loadCatalog()).toEqual({ status: "error" });
    vi.spyOn(services.catalog, "list").mockImplementationOnce(() => {
      throw new Error("synchronous failure");
    });
    expect(await loadCatalog()).toEqual({ status: "error" });
  });
});

/*
 * loadBean and loadDrink share their behavior; each case runs for both.
 */
const itemKinds = [
  {
    kind: "bean",
    load: loadBean,
    knownId: "test-bean-south",
    otherKindId: "test-drink-south",
    record: () => testBean("test-bean-south"),
    stubRead: (result: ApiResult<Bean | Drink> | Error) => {
      const spy = vi.spyOn(services.catalog, "getBean");
      return result instanceof Error ? spy.mockRejectedValue(result) : spy.mockResolvedValue(result as ApiResult<Bean>);
    },
    indexed: (index: CatalogIndex, id: string) => index.beans.has(id),
  },
  {
    kind: "drink",
    load: loadDrink,
    knownId: "test-drink-south",
    otherKindId: "test-bean-south",
    record: () => testDrink("test-drink-south"),
    stubRead: (result: ApiResult<Bean | Drink> | Error) => {
      const spy = vi.spyOn(services.catalog, "getDrink");
      return result instanceof Error ? spy.mockRejectedValue(result) : spy.mockResolvedValue(result as ApiResult<Drink>);
    },
    indexed: (index: CatalogIndex, id: string) => index.drinks.has(id),
  },
] as const;

describe.each(itemKinds)("load a $kind", ({ load, knownId, otherKindId, record, stubRead, indexed }) => {
  it("returns the item and the catalog index when both reads succeed", async () => {
    openGate();
    const read = stubRead(success(record()));
    const list = vi.spyOn(services.catalog, "list").mockResolvedValue(success(testSnapshot()));
    const result = await load(knownId);
    expect(read).toHaveBeenCalledWith(knownId);
    expect(list).toHaveBeenCalledWith({});
    if (result.status !== "ready") throw new Error(`Expected ready, got ${result.status}`);
    expect(result.item).toEqual(record());
    expect(result.preview).toBe(false);
    expect(indexed(result.index, knownId)).toBe(true);
    expect(result.index.sources.has("test-source-one")).toBe(true);
    expect(previewSource).not.toHaveBeenCalled();
  });

  it("reports not-found from the service, even with the development gate open", async () => {
    openGate();
    stubRead(failure("NOT_FOUND"));
    expect(await load("test-item-missing")).toEqual({ status: "not-found" });
    expect(previewSource).not.toHaveBeenCalled();
  });

  it("reports an error when the service returns a malformed item", async () => {
    const { description: _description, ...incomplete } = record();
    stubRead(success(incomplete as Bean & Drink));
    vi.spyOn(services.catalog, "list").mockResolvedValue(success(testSnapshot()));
    expect(await load(knownId)).toEqual({ status: "error" });
  });

  it("reports the catalog's state when the item reads but the catalog context does not", async () => {
    stubRead(success(record()));
    vi.spyOn(services.catalog, "list").mockResolvedValueOnce(unavailable("Catalog"));
    expect(await load(knownId)).toEqual({ status: "unavailable" });
    vi.spyOn(services.catalog, "list").mockResolvedValueOnce(failure("INTERNAL_ERROR"));
    expect(await load(knownId)).toEqual({ status: "error" });
  });

  it.each(CLOSED_GATES)(
    "reports unavailable when the service is unavailable and NODE_ENV=%s, ENABLE_DEV_FIXTURES=%s",
    async (nodeEnv, flag) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("ENABLE_DEV_FIXTURES", flag);
      stubRead(unavailable("Catalog"));
      expect(await load(knownId)).toEqual({ status: "unavailable" });
    },
  );

  it("uses the labeled preview catalog when the service is unavailable and the gate is open", async () => {
    openGate();
    stubRead(unavailable("Catalog"));
    const result = await load(knownId);
    if (result.status !== "ready") throw new Error(`Expected a ready preview, got ${result.status}`);
    expect(result.preview).toBe(true);
    expect(result.item).toEqual(record());
    expect(result.index.snapshot).toEqual(testSnapshot());
  });

  it("reports not-found for an unknown ID in the preview catalog", async () => {
    openGate();
    stubRead(unavailable("Catalog"));
    expect(await load("test-item-missing")).toEqual({ status: "not-found" });
  });

  it("does not return a record of the other kind from the preview catalog", async () => {
    openGate();
    stubRead(unavailable("Catalog"));
    expect(await load(otherKindId)).toEqual({ status: "not-found" });
  });

  it.each<ErrorCode>(["INVALID_INPUT", "UNAUTHENTICATED", "FORBIDDEN", "INTERNAL_ERROR"])(
    "reports an error for %s without substituting preview data",
    async (code) => {
      openGate();
      stubRead(failure(code));
      expect(await load(knownId)).toEqual({ status: "error" });
      expect(previewSource).not.toHaveBeenCalled();
    },
  );

  it("reports a generic error when the service rejects", async () => {
    stubRead(new Error("private-provider-debug-detail"));
    expect(await load(knownId)).toEqual({ status: "error" });
  });
});

describe("production isolation", () => {
  it("never yields preview data in production, even with the fixture flag set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEV_FIXTURES", "true");
    vi.spyOn(services.catalog, "list").mockResolvedValue(unavailable("Catalog"));
    vi.spyOn(services.catalog, "getBean").mockResolvedValue(unavailable("Catalog"));
    vi.spyOn(services.catalog, "getDrink").mockResolvedValue(unavailable("Catalog"));

    const results = await Promise.all([
      loadCatalog(),
      loadBean("test-bean-south"),
      loadDrink("test-drink-south"),
    ]);
    for (const result of results) expect(result).toEqual({ status: "unavailable" });
    // The real gate was consulted and refused every time.
    expect(previewSource).toHaveBeenCalled();
    for (const call of previewSource.mock.results) expect(call.value).toBeNull();
  });

  it("uses the connected catalog service, never preview data, in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEV_FIXTURES", "true");
    const load = await loadCatalog();
    expect(load).toMatchObject({ status: "ready", preview: false });
    expect(await loadBean("example-bean")).toEqual({ status: "not-found" });
    expect(await loadDrink("example-drink")).toEqual({ status: "not-found" });
    expect(previewSource).not.toHaveBeenCalled();
  });
});
