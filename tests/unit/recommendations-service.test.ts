import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type CatalogSnapshot,
  catalogSnapshotSchema,
  type Preferences,
  type RecommendationRequest,
  recommendationRequestSchema,
  recommendationResponseSchema,
} from "@/contracts";
import { type AiResult, generateStructured, type StructuredRequest } from "@/lib/server/ai-client";
import { selectCandidates } from "@/modules/recommendations/lib/candidates";
import { buildLookup } from "@/modules/recommendations/lib/lookup";
import type { ModelOutput } from "@/modules/recommendations/lib/model-output";
import { createRecommendationService } from "@/modules/recommendations/server/service";
import { getInitialSearch } from "@/modules/recommendations/ui/search-context";

const src = (id: string) => ({ id, title: `Source ${id}`, url: `https://example.org/${id}`, publisher: null, accessedAt: "2026-10-16" });

/** Synthetic test catalog: two countries, one region, beans at region and country level, drinks with country associations. */
const snapshot: CatalogSnapshot = catalogSnapshotSchema.parse({
  countries: [
    { id: "test-country-a", name: "Country A", isoCode: null, center: null, summary: "A.", sourceIds: ["src-a"] },
    { id: "test-country-b", name: "Country B", isoCode: null, center: null, summary: "B.", sourceIds: ["src-b"] },
  ],
  regions: [
    { id: "test-region-a", countryId: "test-country-a", name: "Region A", center: null, summary: "RA.", sourceIds: ["src-a"] },
  ],
  beans: [
    {
      id: "bean-region", name: "Region Bean", description: "Grown in Region A.",
      origin: { countryId: "test-country-a", regionId: "test-region-a" },
      flavorNotes: ["chocolate"], varieties: [], processingMethods: [], roastDescription: null, growingConditions: null,
      sourceIds: ["src-bean-region"],
    },
    {
      id: "bean-country", name: "Country Bean", description: "Grown somewhere in Country A.",
      origin: { countryId: "test-country-a", regionId: null },
      flavorNotes: ["citrus"], varieties: [], processingMethods: [], roastDescription: null, growingConditions: null,
      sourceIds: ["src-bean-country"],
    },
    {
      id: "bean-b", name: "B Bean", description: "Grown in Country B.",
      origin: { countryId: "test-country-b", regionId: null },
      flavorNotes: ["nutty"], varieties: [], processingMethods: [], roastDescription: null, growingConditions: null,
      sourceIds: ["src-bean-b"],
    },
  ],
  drinks: [
    {
      id: "drink-a", name: "A Milk Coffee", description: "A milk coffee from Country A.",
      associatedLocations: [{ countryId: "test-country-a", regionId: null }],
      flavorNotes: ["creamy"], ingredients: ["coffee", "milk"], preparation: null, culturalContext: null,
      sourceIds: ["src-drink-a"],
    },
    {
      id: "drink-b", name: "B Coffee", description: "A drink from Country B.",
      associatedLocations: [{ countryId: "test-country-b", regionId: null }],
      flavorNotes: [], ingredients: ["coffee"], preparation: null, culturalContext: null,
      sourceIds: ["src-drink-b"],
    },
  ],
  pairings: [
    { id: "pairing-a", beanId: "bean-region", drinkId: "drink-a", relationship: "suggested", explanation: "Works with milk.", sourceIds: ["src-pairing"] },
  ],
  sources: ["src-a", "src-b", "src-bean-region", "src-bean-country", "src-bean-b", "src-drink-a", "src-drink-b", "src-pairing"].map(src),
});

const preferences: Preferences = {
  acidity: "low", sweetness: "medium", roast: "any", milk: "dairy",
  flavors: ["chocolate"], preparationMethods: ["espresso"], notes: "I like sweet milk coffee.",
};

const request = (overrides: Partial<RecommendationRequest> = {}): RecommendationRequest =>
  recommendationRequestSchema.parse({ preferences, itemType: "both", geography: { scope: "global" }, ...overrides });

const answer = (output: Partial<ModelOutput>): AiResult<ModelOutput> => ({
  ok: true,
  data: { outcome: "matches", matches: [], noMatchReason: "", suggestions: [], ...output },
});

const match = (itemType: "bean" | "drink", itemId: string, sourceIds: string[] = []) =>
  ({ itemType, itemId, reasons: [" Fits your taste. "], tradeOffs: [], sourceIds });

function setup(...answers: AiResult<ModelOutput>[]) {
  const generate = vi.fn(async (_request: StructuredRequest<unknown>) => answers.shift() ?? answer({}));
  const service = createRecommendationService({
    loadCatalog: async () => ({ status: "ready", snapshot, preview: false }),
    generate: generate as never,
  });
  return { generate, recommend: (input: RecommendationRequest) => service.recommend(new Request("http://localhost"), input) };
}

describe("recommendation candidates", () => {
  it("limits a selected region to beans grown there and drinks associated with its country", () => {
    const set = selectCandidates(snapshot, request({ geography: { scope: "selected", countryId: "test-country-a", regionId: "test-region-a" } }));
    expect(set.candidates.map((entry) => entry.item.itemId)).toEqual(["bean-region", "drink-a"]);
    expect(set.areaLabel).toBe("Region A, Country A");
  });

  it("keeps a global search unrestricted while remembering where the user was browsing", () => {
    const set = selectCandidates(snapshot, request({ geography: { scope: "global", countryId: "test-country-b" } }));
    expect(set.candidates).toHaveLength(5);
    expect(set.browsingLabel).toBe("Country B");
  });

  it("excludes the starting item and lets its pairing sources be cited", () => {
    const set = selectCandidates(snapshot, request({ itemType: "drink", startingItem: { itemType: "bean", itemId: "bean-region" } }));
    expect(set.candidates.map((entry) => entry.item.itemId)).toEqual(["drink-a", "drink-b"]);
    expect(set.startingItem?.name).toBe("Region Bean");
    expect(set.candidates[0]?.allowedSourceIds).toEqual(["src-drink-a", "src-pairing"]);
  });
});

describe("recommendation service", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports an unconnected catalog without calling the model", async () => {
    const generate = vi.fn();
    const service = createRecommendationService({ loadCatalog: async () => ({ status: "unavailable" }), generate });
    const result = await service.recommend(new Request("http://localhost"), request());
    expect(result).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE", retryable: false } });
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    [{ geography: { scope: "selected", countryId: "missing-country" } }, "country"],
    [{ geography: { scope: "selected", countryId: "test-country-b", regionId: "test-region-a" } }, "region"],
    [{ startingItem: { itemType: "drink", itemId: "bean-region" } }, "starting drink"],
  ] as const)("rejects references the catalog does not have (%#)", async (overrides, word) => {
    const { recommend, generate } = setup();
    const result = await recommend(request(overrides as Partial<RecommendationRequest>));
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    if (!result.ok) expect(result.error.message).toContain(word);
    expect(generate).not.toHaveBeenCalled();
  });

  it("asks for preferences instead of guessing when every answer is empty", async () => {
    const { recommend, generate } = setup();
    const result = await recommend(request({
      preferences: { acidity: "any", sweetness: "any", roast: "any", milk: "any", flavors: [], preparationMethods: [], notes: " " },
    }));
    expect(result).toMatchObject({ ok: true, data: { status: "no-match" } });
    expect(generate).not.toHaveBeenCalled();
  });

  it("explains an empty area with actionable suggestions and no model call", async () => {
    const { recommend, generate } = setup();
    const result = await recommend(request({ itemType: "bean", geography: { scope: "selected", countryId: "test-country-b" }, startingItem: { itemType: "bean", itemId: "bean-b" } }));
    expect(result).toEqual({
      ok: true,
      data: {
        status: "no-match",
        reason: "The catalog has no other beans for Country B yet.",
        suggestions: ["Search all supported locations instead of this one.", "Include drinks as well."],
      },
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns validated matches, drops unknown sources and respects the limit", async () => {
    const { recommend, generate } = setup(answer({
      matches: [match("drink", "drink-a", ["src-drink-a", "made-up-source"]), match("bean", "bean-b", ["made-up-source"]), match("bean", "bean-country")],
    }));
    const result = await recommend(request({ limit: 2 }));
    expect(result).toEqual({
      ok: true,
      data: {
        status: "matches",
        matches: [
          { item: { itemType: "drink", itemId: "drink-a" }, reasons: ["Fits your taste."], tradeOffs: [], sourceIds: ["src-drink-a"] },
          { item: { itemType: "bean", itemId: "bean-b" }, reasons: ["Fits your taste."], tradeOffs: [], sourceIds: ["src-bean-b"] },
        ],
      },
    });
    if (result.ok) expect(recommendationResponseSchema.safeParse(result.data).success).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("sends user notes as delimited data alongside only the eligible candidates", async () => {
    const { recommend, generate } = setup(answer({ matches: [match("bean", "bean-region")] }));
    await recommend(request({ geography: { scope: "selected", countryId: "test-country-a", regionId: "test-region-a" } }));
    const prompt = generate.mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("<user_notes>\nI like sweet milk coffee.\n</user_notes>");
    expect(prompt).toContain("\"itemId\":\"bean-region\"");
    expect(prompt).not.toContain("bean-b");
  });

  it("retries once when the model recommends an item that was not offered", async () => {
    const { recommend, generate } = setup(
      answer({ matches: [match("bean", "bean-b")] }),
      answer({ matches: [match("bean", "bean-region")] }),
    );
    const result = await recommend(request({ geography: { scope: "selected", countryId: "test-country-a" } }));
    expect(result).toMatchObject({ ok: true, data: { status: "matches", matches: [{ item: { itemId: "bean-region" } }] } });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0].prompt).toContain("bean:bean-b is not one of the candidates.");
  });

  it("never shows an unverified answer after repeated invalid output", async () => {
    const { recommend, generate } = setup(
      answer({ matches: [match("bean", "invented-bean")] }),
      { ok: false, failure: { kind: "invalid-output" } },
    );
    const result = await recommend(request());
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR", retryable: true } });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("passes on a model no-match answer with its reason", async () => {
    const { recommend } = setup(answer({ outcome: "no-match", noMatchReason: "Black coffee and milk drinks conflict.", suggestions: ["Do you drink milk?"] }));
    expect(await recommend(request())).toEqual({
      ok: true,
      data: { status: "no-match", reason: "Black coffee and milk drinks conflict.", suggestions: ["Do you drink milk?"] },
    });
  });

  it.each([
    [{ kind: "not-configured" }, "SERVICE_UNAVAILABLE", false],
    [{ kind: "provider", retryable: true }, "SERVICE_UNAVAILABLE", true],
    [{ kind: "provider", retryable: false }, "SERVICE_UNAVAILABLE", false],
    [{ kind: "refused" }, "INTERNAL_ERROR", false],
  ] as const)("maps provider failure %o to an error, not a no-match", async (failure, code, retryable) => {
    const { recommend, generate } = setup({ ok: false, failure });
    expect(await recommend(request())).toMatchObject({ ok: false, error: { code, retryable } });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("reports a missing model key without any network call", async () => {
    vi.stubEnv("MODEL_API_KEY", "");
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network call"));
    const result = await generateStructured({ system: "s", prompt: "p", schema: catalogSnapshotSchema });
    expect(result).toEqual({ ok: false, failure: { kind: "not-configured" } });
    expect(network).not.toHaveBeenCalled();
  });
});

describe("recommendation page helpers", () => {
  it("turns a deep link into form defaults and leaves missing choices open", () => {
    expect(getInitialSearch({ countryId: "test-country-a", regionId: "test-region-a", type: "bean", beanId: "bean-region" })).toEqual({
      itemType: "bean", scope: null, countryId: "test-country-a", regionId: "test-region-a",
      startingItem: { itemType: "bean", itemId: "bean-region" },
    });
    expect(getInitialSearch({ scope: "selected", regionId: "test-region-a", beanId: "a-bean", drinkId: "a-drink" })).toEqual({
      itemType: null, scope: null, countryId: null, regionId: null, startingItem: null,
    });
  });

  it("builds display names, links and places from the catalog", () => {
    const lookup = buildLookup(snapshot);
    expect(lookup.items["bean:bean-region"]).toEqual({ name: "Region Bean", href: "/beans/bean-region", place: "Region A, Country A" });
    expect(lookup.items["drink:drink-b"]?.place).toBe("Country B");
    expect(lookup.countries[0]?.regions).toEqual([{ id: "test-region-a", name: "Region A" }]);
  });
});
