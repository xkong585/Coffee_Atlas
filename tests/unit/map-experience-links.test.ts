import { describe, expect, it } from "vitest";
import { itemReferenceSchema, recommendationGeographySchema } from "@/contracts";
import {
  beanPath,
  drinkPath,
  explorePath,
  focusFromPath,
  mapKey,
  type RecommendationLinkInput,
  recommendationHref,
} from "@/modules/map-experience/lib/links";

/** The deep-link query names documented in docs/CONTRACTS.md. */
const DOCUMENTED_QUERY_NAMES = ["type", "scope", "countryId", "regionId", "beanId", "drinkId"];

function parseHref(href: string): URL {
  const url = new URL(href, "http://localhost");
  expect(url.pathname).toBe("/recommendations");
  return url;
}

/** The query as the /recommendations page receives it; repeated keys become arrays. */
type SearchParams = Record<string, string | string[] | undefined>;

function searchParamsOf(href: string): SearchParams {
  const params: SearchParams = {};
  for (const [key, value] of parseHref(href).searchParams) {
    const existing = params[key];
    params[key] = existing === undefined ? value : [...(Array.isArray(existing) ? existing : [existing]), value];
  }
  return params;
}

describe("explorePath", () => {
  it("builds world, country and region paths", () => {
    expect(explorePath()).toBe("/explore");
    expect(explorePath(null)).toBe("/explore");
    expect(explorePath("")).toBe("/explore");
    expect(explorePath("test-country-a")).toBe("/explore/test-country-a");
    expect(explorePath("test-country-a", null)).toBe("/explore/test-country-a");
    expect(explorePath("test-country-a", "")).toBe("/explore/test-country-a");
    expect(explorePath("test-country-a", "test-region-a")).toBe("/explore/test-country-a/test-region-a");
  });

  it("ignores a region without a country", () => {
    expect(explorePath(undefined, "test-region-a")).toBe("/explore");
    expect(explorePath(null, "test-region-a")).toBe("/explore");
  });

  it("encodes each segment so IDs cannot change the route", () => {
    expect(explorePath("a b/c", "d?e#f")).toBe("/explore/a%20b%2Fc/d%3Fe%23f");
    expect(explorePath("../admin")).toBe("/explore/..%2Fadmin");
    expect(explorePath("café")).toBe("/explore/caf%C3%A9");
  });
});

describe("focusFromPath", () => {
  it("round-trips world, country and region paths built by explorePath", () => {
    expect(focusFromPath(explorePath())).toEqual({ level: "world" });
    expect(focusFromPath(explorePath("test-country-a"))).toEqual({ level: "country", countryId: "test-country-a" });
    expect(focusFromPath(explorePath("test-country-a", "test-region-a"))).toEqual({
      level: "region",
      countryId: "test-country-a",
      regionId: "test-region-a",
    });
  });

  it("decodes encoded segments before checking them", () => {
    // Stable IDs never need encoding, but a link may still escape their characters.
    expect(focusFromPath("/explore/%74est-country-a/test%2Dregion-a")).toEqual({
      level: "region",
      countryId: "test-country-a",
      regionId: "test-region-a",
    });
  });

  it("gives null for IDs that only exist encoded, rather than another place", () => {
    for (const path of [explorePath("a b/c", "d?e#f"), explorePath("../admin"), explorePath("café")]) {
      expect(focusFromPath(path)).toBeNull();
    }
  });

  it("accepts a trailing slash", () => {
    expect(focusFromPath("/explore/")).toEqual({ level: "world" });
    expect(focusFromPath("/explore/test-country-a/")).toEqual({ level: "country", countryId: "test-country-a" });
    expect(focusFromPath("/explore/test-country-a/test-region-a/")).toEqual({
      level: "region",
      countryId: "test-country-a",
      regionId: "test-region-a",
    });
  });

  it.each([
    "/explorer",
    "/explorer/test-country-a",
    "/explore/a/b/c",
    "/explore/test-country-a/test-region-a/extra",
    "/explore//",
    "/explore/test-country-a//",
    "/beans/x",
    "/",
    "",
    "explore/test-country-a",
    "/Explore",
  ])("gives null for %s", (path) => {
    expect(focusFromPath(path)).toBeNull();
  });

  it.each([
    ["uppercase letters", "/explore/Test-Country"],
    ["an underscore", "/explore/test_country"],
    ["a single character", "/explore/t"],
    ["a leading digit", "/explore/1-country"],
    ["81 characters", `/explore/t${"a".repeat(80)}`],
    ["an invalid region", "/explore/test-country-a/Test_Region"],
    ["an encoded slash", "/explore/test%2Fcountry"],
    ["a broken escape", "/explore/test-%E0%A4%A"],
  ])("gives null for an ID with %s", (_label, path) => {
    expect(focusFromPath(path)).toBeNull();
  });
});

describe("mapKey", () => {
  it("keys countries and regions the way the map keys its markers", () => {
    expect(mapKey("ethiopia")).toBe("country:ethiopia");
    expect(mapKey("ethiopia", null)).toBe("country:ethiopia");
    expect(mapKey("ethiopia", "ethiopia-harar")).toBe("region:ethiopia/ethiopia-harar");
  });
});

describe("beanPath and drinkPath", () => {
  it("builds detail paths from stable IDs", () => {
    expect(beanPath("test-bean")).toBe("/beans/test-bean");
    expect(drinkPath("test-drink")).toBe("/drinks/test-drink");
  });

  it("encodes the ID", () => {
    expect(beanPath("x/../y")).toBe("/beans/x%2F..%2Fy");
    expect(drinkPath("a&b=c?d")).toBe("/drinks/a%26b%3Dc%3Fd");
    expect(drinkPath("<script>")).toBe("/drinks/%3Cscript%3E");
  });
});

describe("recommendationHref", () => {
  it("passes selected country and region context with the documented names, in a stable order", () => {
    expect(
      recommendationHref({ type: "both", scope: "selected", countryId: "test-country-a", regionId: "test-region-a" }),
    ).toBe("/recommendations?type=both&scope=selected&countryId=test-country-a&regionId=test-region-a");
  });

  it("builds a global link with no location", () => {
    expect(recommendationHref({ type: "both", scope: "global" })).toBe("/recommendations?type=both&scope=global");
  });

  it("passes the item type through", () => {
    for (const type of ["bean", "drink", "both"] as const) {
      expect(searchParamsOf(recommendationHref({ type, scope: "global" })).type).toBe(type);
    }
  });

  it("only ever uses the documented query names", () => {
    const href = recommendationHref({
      type: "bean",
      scope: "selected",
      countryId: "test-country-a",
      regionId: "test-region-a",
      beanId: "test-bean",
      drinkId: "test-drink",
    });
    const keys = [...parseHref(href).searchParams.keys()];
    expect(keys).toEqual(["type", "scope", "countryId", "regionId", "beanId"]);
    for (const key of keys) expect(DOCUMENTED_QUERY_NAMES).toContain(key);
    // Request-body names belong to the later POST body, not the page URL.
    for (const bodyName of ["itemType", "geography", "startingItem", "limit"]) expect(keys).not.toContain(bodyName);
  });

  it("omits null and undefined fields", () => {
    const href = recommendationHref({
      type: "drink",
      scope: "global",
      countryId: null,
      regionId: undefined,
      beanId: null,
      drinkId: "test-drink",
    });
    expect(href).toBe("/recommendations?type=drink&scope=global&drinkId=test-drink");
  });

  it("keeps a global search's location context without restricting it", () => {
    expect(recommendationHref({ type: "both", scope: "global", countryId: "test-country-a", beanId: "test-bean" })).toBe(
      "/recommendations?type=both&scope=global&countryId=test-country-a&beanId=test-bean",
    );
  });

  it.each([
    ["uppercase letters", "Test-Country"],
    ["an underscore", "test_country"],
    ["a script tag", "<script>alert(1)</script>"],
    ["81 characters", `t${"a".repeat(80)}`],
    ["a single character", "t"],
    ["a leading digit", "1-country"],
    ["a leading space", " test-country"],
    ["an empty string", ""],
  ])("drops IDs with %s", (_label, invalid) => {
    const href = recommendationHref({
      type: "both",
      scope: "selected",
      countryId: invalid,
      regionId: invalid,
      beanId: invalid,
      drinkId: invalid,
    });
    expect(href).toBe("/recommendations?type=both&scope=global");
    expect(href).not.toContain("script");
  });

  it("accepts an 80-character ID, the longest the contract allows", () => {
    const longest = `t${"a".repeat(79)}`;
    expect(searchParamsOf(recommendationHref({ type: "bean", scope: "selected", countryId: longest })).countryId).toBe(
      longest,
    );
  });

  it("drops an invalid region but keeps its valid country", () => {
    expect(
      recommendationHref({ type: "both", scope: "selected", countryId: "test-country-a", regionId: "Test_Region" }),
    ).toBe("/recommendations?type=both&scope=selected&countryId=test-country-a");
  });

  it("drops a region without a valid country", () => {
    expect(recommendationHref({ type: "both", scope: "selected", regionId: "test-region-a" })).toBe(
      "/recommendations?type=both&scope=global",
    );
    expect(
      recommendationHref({ type: "both", scope: "selected", countryId: "BAD", regionId: "test-region-a" }),
    ).toBe("/recommendations?type=both&scope=global");
  });

  it("falls back to a global search when the selected scope has no country", () => {
    expect(searchParamsOf(recommendationHref({ type: "bean", scope: "selected" })).scope).toBe("global");
    expect(searchParamsOf(recommendationHref({ type: "bean", scope: "selected", countryId: null })).scope).toBe(
      "global",
    );
  });

  it("passes at most one starting item, preferring the bean", () => {
    expect(recommendationHref({ type: "both", scope: "global", beanId: "test-bean", drinkId: "test-drink" })).toBe(
      "/recommendations?type=both&scope=global&beanId=test-bean",
    );
    // An invalid bean does not block a valid drink.
    expect(recommendationHref({ type: "both", scope: "global", beanId: "Bad Bean", drinkId: "test-drink" })).toBe(
      "/recommendations?type=both&scope=global&drinkId=test-drink",
    );
  });
});

describe("recommendation links and the recommendation request contract", () => {
  // Only the documented query names and values are checked here; how the
  // recommendations page displays them is Member 5's to change.
  const cases: [string, RecommendationLinkInput, Record<string, string>][] = [
    ["a world-level search", { type: "both", scope: "global" }, { type: "both", scope: "global" }],
    [
      "a country",
      { type: "both", scope: "selected", countryId: "test-country-a" },
      { type: "both", scope: "selected", countryId: "test-country-a" },
    ],
    [
      "a region",
      { type: "both", scope: "selected", countryId: "test-country-a", regionId: "test-region-a" },
      { type: "both", scope: "selected", countryId: "test-country-a", regionId: "test-region-a" },
    ],
    [
      "a bean",
      { type: "both", scope: "global", countryId: "test-country-a", regionId: "test-region-a", beanId: "test-bean" },
      { type: "both", scope: "global", countryId: "test-country-a", regionId: "test-region-a", beanId: "test-bean" },
    ],
    [
      "a drink",
      { type: "drink", scope: "global", drinkId: "test-drink" },
      { type: "drink", scope: "global", drinkId: "test-drink" },
    ],
    [
      "a bean and a drink together",
      { type: "bean", scope: "global", beanId: "test-bean", drinkId: "test-drink" },
      { type: "bean", scope: "global", beanId: "test-bean" },
    ],
    [
      "invalid IDs",
      { type: "both", scope: "selected", countryId: "Bad", regionId: "test_region", beanId: "<b>", drinkId: "x" },
      { type: "both", scope: "global" },
    ],
  ];

  it.each(cases)("writes the documented query values for a link built from %s", (_label, input, expected) => {
    const params = searchParamsOf(recommendationHref(input));
    expect(params).toEqual(expected);
    for (const key of Object.keys(params)) expect(DOCUMENTED_QUERY_NAMES).toContain(key);
  });

  it.each(cases)("maps a link built from %s onto a valid request geography and starting item", (_label, input) => {
    const params = searchParamsOf(recommendationHref(input));
    const geography = recommendationGeographySchema.safeParse({
      scope: params.scope,
      ...(params.countryId === undefined ? {} : { countryId: params.countryId }),
      ...(params.regionId === undefined ? {} : { regionId: params.regionId }),
    });
    expect(geography.success).toBe(true);
    expect(params.beanId !== undefined && params.drinkId !== undefined).toBe(false);
    if (params.beanId !== undefined) {
      expect(itemReferenceSchema.safeParse({ itemType: "bean", itemId: params.beanId }).success).toBe(true);
    }
    if (params.drinkId !== undefined) {
      expect(itemReferenceSchema.safeParse({ itemType: "drink", itemId: params.drinkId }).success).toBe(true);
    }
  });
});
