import { describe, expect, it } from "vitest";
import { getRecommendationContext } from "@/modules/recommendations/ui/search-context";

describe("recommendation URL context", () => {
  it("preserves valid location, type, and starting-item references without claiming catalog matches", () => {
    expect(getRecommendationContext({
      countryId: "example-country", regionId: "example-region", scope: "selected",
      type: "both", beanId: "example-bean",
    })).toEqual([
      { label: "Country reference", value: "example-country" },
      { label: "Region reference", value: "example-region" },
      { label: "Search area", value: "Selected location" },
      { label: "Looking for", value: "Beans and drinks" },
      { label: "Starting bean reference", value: "example-bean" },
    ]);
  });

  it.each(["Example", "example_id", "x", "3-bean", "a".repeat(81), "<script>alert(1)</script>"])(
    "does not show IDs that the shared contract rejects: %s", (value) => {
      expect(getRecommendationContext({ countryId: value, beanId: value, scope: "selected" })).toEqual([]);
    },
  );

  it("ignores repeated parameters and unsupported scope/type values", () => {
    expect(getRecommendationContext({
      countryId: ["first-country", "second-country"], regionId: "example-region",
      scope: "nearby", type: ["bean", "drink"], drinkId: ["example-drink"],
    })).toEqual([]);
  });

  it("does not show a region or selected-area scope without a valid country", () => {
    expect(getRecommendationContext({ regionId: "example-region", scope: "selected" })).toEqual([]);
    expect(getRecommendationContext({ countryId: "INVALID", regionId: "example-region", scope: "selected" })).toEqual([]);
  });

  it.each(["example-bean", "INVALID", "", ["example-bean"]])(
    "ignores an ambiguous starting item when both query keys are supplied: %s", (beanId) => {
      expect(getRecommendationContext({ beanId, drinkId: "example-drink" })).toEqual([]);
    },
  );

  it("allows global discovery and a single valid drink reference", () => {
    expect(getRecommendationContext({ scope: "global", type: "drink", drinkId: "example-drink", unrelated: "ignored" })).toEqual([
      { label: "Search area", value: "All supported locations" },
      { label: "Looking for", value: "Regional drinks" },
      { label: "Starting drink reference", value: "example-drink" },
    ]);
  });
});
