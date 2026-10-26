import { describe, expect, it, vi } from "vitest";
import { type CatalogSnapshot, catalogSnapshotSchema } from "@/contracts";
import { CATALOG_RECORDS } from "@/modules/catalog/data/records";
import { filterCatalog } from "@/modules/catalog/lib/filter";
import { findCatalogProblems } from "@/modules/catalog/lib/integrity";
import { createCatalogService, loadCatalogRecords } from "@/modules/catalog/server/service";

const snapshot = (): CatalogSnapshot => catalogSnapshotSchema.parse(CATALOG_RECORDS);

describe("catalog records (npm run catalog:check)", () => {
  it("match the shared contract", () => {
    const parsed = catalogSnapshotSchema.safeParse(CATALOG_RECORDS);
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it("have no duplicate IDs, broken references, invalid geography or uncited sources", () => {
    expect(findCatalogProblems(snapshot())).toEqual([]);
  });

  it("keep bean origin, drink association and pairing kinds distinct", () => {
    const data = snapshot();
    expect(data.pairings.some((pairing) => pairing.relationship === "documented")).toBe(true);
    expect(data.pairings.some((pairing) => pairing.relationship === "suggested")).toBe(true);
    // Some countries are in the atlas for their drinks alone (no beans grown there).
    const growing = new Set(data.beans.map((bean) => bean.origin.countryId));
    expect(data.countries.some((country) => !growing.has(country.id))).toBe(true);
  });

  it("cite only absolute HTTP(S) sources with an access date", () => {
    for (const source of snapshot().sources) {
      expect(source.url).toMatch(/^https?:\/\//);
      expect(source.url).not.toContain("example.invalid");
      expect(source.accessedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("integrity checker", () => {
  it("reports each kind of broken reference", () => {
    const data = snapshot();
    const [bean] = data.beans;
    const [drink] = data.drinks;
    const [pairing] = data.pairings;
    const otherCountry = data.countries.find((country) => !data.regions.some((region) => region.countryId === country.id && region.id === data.regions[0].id));
    const broken: CatalogSnapshot = {
      ...data,
      beans: [{ ...bean, origin: { countryId: otherCountry?.id ?? "nowhere", regionId: data.regions[0].id } }, bean, ...data.beans.slice(1)],
      drinks: [{ ...drink, sourceIds: ["src-missing"] }, ...data.drinks.slice(1)],
      pairings: [{ ...pairing, beanId: "bean-missing" }, ...data.pairings.slice(1)],
      sources: [...data.sources, { id: "src-unused", title: "Unused", url: "https://example.org", publisher: null, accessedAt: "2026-10-20" }],
    };
    const problems = findCatalogProblems(broken).join("\n");
    expect(problems).toContain(`Duplicate bean ID "${bean.id}"`);
    expect(problems).toContain("but it belongs to");
    expect(problems).toContain('cites unknown source "src-missing"');
    expect(problems).toContain('unknown bean "bean-missing"');
    expect(problems).toContain('Source "src-unused" is not cited');
  });
});

describe("catalog filter", () => {
  it("returns null for an unknown place or a region outside its country", () => {
    const data = snapshot();
    expect(filterCatalog(data, { countryId: "nowhere" })).toBeNull();
    const region = data.regions[0];
    const other = data.countries.find((country) => country.id !== region.countryId);
    expect(filterCatalog(data, { countryId: other?.id, regionId: region.id })).toBeNull();
  });

  it("keeps a filtered snapshot self-contained", () => {
    const data = snapshot();
    for (const country of data.countries) {
      const filtered = filterCatalog(data, { countryId: country.id });
      expect(filtered).not.toBeNull();
      if (!filtered) continue;
      expect(findCatalogProblems(filtered).filter((problem) => !problem.includes("is not cited"))).toEqual([]);
      for (const bean of filtered.beans) expect(bean.origin.countryId).toBe(country.id);
      for (const drink of filtered.drinks) expect(drink.associatedLocations.some((l) => l.countryId === country.id)).toBe(true);
    }
  });

  it("does not claim a country-level bean for a region", () => {
    const data = snapshot();
    const region = data.regions.find((entry) => data.beans.some((bean) => bean.origin.countryId === entry.countryId && bean.origin.regionId === null));
    if (!region) return;
    const filtered = filterCatalog(data, { countryId: region.countryId, regionId: region.id });
    for (const bean of filtered?.beans ?? []) expect(bean.origin.regionId).toBe(region.id);
  });
});

describe("catalog service", () => {
  it("serves beans and drinks by ID and reports NOT_FOUND otherwise", async () => {
    const service = createCatalogService(() => loadCatalogRecords(CATALOG_RECORDS));
    const data = snapshot();
    expect(await service.getBean(data.beans[0].id)).toEqual({ ok: true, data: data.beans[0] });
    expect(await service.getDrink(data.drinks[0].id)).toEqual({ ok: true, data: data.drinks[0] });
    expect(await service.getBean(data.drinks[0].id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await service.getDrink("drink-missing")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await service.list({ countryId: "nowhere" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const all = await service.list({});
    expect(all.ok && all.data.countries.length).toBe(data.countries.length);
  });

  it("returns copies that callers cannot use to change the catalog", async () => {
    const service = createCatalogService(() => loadCatalogRecords(CATALOG_RECORDS));
    const first = await service.list({});
    if (first.ok) first.data.beans[0].name = "changed";
    const second = await service.list({});
    expect(second.ok && second.data.beans[0].name).not.toBe("changed");
  });

  it("refuses to serve a catalog that fails its checks", async () => {
    const data = snapshot();
    const service = createCatalogService(() =>
      loadCatalogRecords({ ...data, pairings: [{ ...data.pairings[0], drinkId: "drink-missing" }] }),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const result of [await service.list({}), await service.getBean(data.beans[0].id)]) {
      expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR" } });
    }
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
