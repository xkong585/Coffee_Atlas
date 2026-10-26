import { describe, expect, it } from "vitest";
import {
  catalogFilterSchema, checkoutInputSchema, coordinatesSchema, countrySchema, PAID_CAPABILITY, preferencesSchema, regionSchema,
  recommendationRequestSchema, recommendationResponseSchema, savedItemInputSchema, sourceSchema,
} from "@/contracts";

const preferences = {
  acidity: "low", sweetness: "any", roast: "medium", milk: "dairy",
  flavors: ["chocolate"], preparationMethods: ["espresso"], notes: "",
};

describe("shared input contracts", () => {
  it("restricts provenance links to HTTP or HTTPS sources", () => {
    const source = { id: "example-source", title: "Example source", publisher: null, accessedAt: "2026-10-16" };
    expect(sourceSchema.safeParse({ ...source, url: "https://example.invalid/source" }).success).toBe(true);
    expect(sourceSchema.safeParse({ ...source, url: "javascript:alert(1)" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...source, url: "file:///private/example" }).success).toBe(false);
  });

  it("bounds coordinates and keeps missing map locations explicit", () => {
    expect(coordinatesSchema.safeParse({ latitude: -90, longitude: 180 }).success).toBe(true);
    expect(coordinatesSchema.safeParse({ latitude: 90, longitude: -180 }).success).toBe(true);
    expect(coordinatesSchema.safeParse({ latitude: 90.1, longitude: 0 }).success).toBe(false);
    expect(coordinatesSchema.safeParse({ latitude: 0, longitude: -180.1 }).success).toBe(false);
    expect(coordinatesSchema.safeParse({ latitude: Number.NaN, longitude: 0 }).success).toBe(false);
    const country = { id: "example-country", name: "Example", isoCode: null, summary: "Example only", sourceIds: ["example-source"] };
    const region = { id: "example-region", countryId: "example-country", name: "Example region", summary: "Example only", sourceIds: ["example-source"] };
    expect(countrySchema.safeParse(country).success).toBe(false);
    expect(regionSchema.safeParse(region).success).toBe(false);
    expect(countrySchema.parse({ ...country, center: null }).center).toBeNull();
    expect(regionSchema.parse({ ...region, center: { latitude: 0, longitude: 0 } }).center).toEqual({ latitude: 0, longitude: 0 });
  });

  it("rejects injected identity and access fields on user operations", () => {
    expect(preferencesSchema.safeParse({ ...preferences, userId: "someone-else" }).success).toBe(false);
    expect(savedItemInputSchema.safeParse({ itemType: "bean", itemId: "example-bean", userId: "someone-else" }).success).toBe(false);
    expect(checkoutInputSchema.safeParse({ capability: PAID_CAPABILITY, paid: true }).success).toBe(false);
    expect(checkoutInputSchema.safeParse({ capability: PAID_CAPABILITY, priceId: "client-chosen-price" }).success).toBe(false);
    expect(checkoutInputSchema.safeParse({ capability: PAID_CAPABILITY }).success).toBe(true);
  });

  it("bounds natural-language input and rejects unknown preferences", () => {
    expect(preferencesSchema.safeParse(preferences).success).toBe(true);
    expect(preferencesSchema.safeParse({ ...preferences, notes: "a".repeat(1001) }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...preferences, acidity: "very-sour" }).success).toBe(false);
  });

  it("requires country context when filtering a region", () => {
    expect(catalogFilterSchema.safeParse({ regionId: "example-region" }).success).toBe(false);
    expect(catalogFilterSchema.safeParse({ countryId: "example-country", regionId: "example-region" }).success).toBe(true);
  });

  it("requires selected geography and preserves stable starting-item IDs", () => {
    const base = { preferences, itemType: "both", geography: { scope: "global" } };
    expect(recommendationRequestSchema.parse(base).limit).toBe(3);
    expect(recommendationRequestSchema.safeParse({ ...base, geography: { scope: "selected" } }).success).toBe(false);
    const request = recommendationRequestSchema.parse({
      ...base, startingItem: { itemType: "drink", itemId: "example-drink" },
    });
    expect(request.startingItem?.itemId).toBe("example-drink");
  });

  it("requires grounded result references and an explicit no-match response", () => {
    expect(recommendationResponseSchema.safeParse({ status: "matches", matches: [] }).success).toBe(false);
    expect(recommendationResponseSchema.safeParse({
      status: "matches", matches: [{ item: { itemType: "bean", itemId: "example-bean" }, reasons: ["Example reason"], tradeOffs: [], sourceIds: [] }],
    }).success).toBe(false);
    expect(recommendationResponseSchema.safeParse({ status: "no-match", reason: "No supported candidates.", suggestions: [] }).success).toBe(true);
  });
});
