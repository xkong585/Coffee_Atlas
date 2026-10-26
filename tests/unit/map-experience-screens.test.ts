import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { type CatalogSnapshot, catalogSnapshotSchema } from "@/contracts";
import { indexCatalog } from "@/modules/map-experience/lib/catalog-view";
import type { CatalogLoad, ItemLoad } from "@/modules/map-experience/server/catalog-loader";
import { BeanDetailScreen, DrinkDetailScreen } from "@/modules/map-experience/ui/detail-screen";
import { DetailSkeleton } from "@/modules/map-experience/ui/detail-skeleton";
import {
  ExploreCountryScreen,
  ExploreRegionScreen,
  ExploreWorldScreen,
} from "@/modules/map-experience/ui/explore-screen";
import { BeanCards } from "@/modules/map-experience/ui/item-cards";

// The WebGL map is a client enhancement; here it only records the props it receives.
vi.mock("@/modules/map-experience/ui/explore-map", () => ({
  ExploreMap: (props: { countries: unknown[]; regions: unknown[]; focus: unknown; label: string }) =>
    createElement("div", {
      "data-test-map": "",
      "data-countries": props.countries.length,
      "data-regions": props.regions.length,
      "data-focus": JSON.stringify(props.focus),
      "aria-label": props.label,
    }),
}));

const source = (id: string, publisher: string | null = "Test Publisher") => ({
  id,
  title: `Title ${id}`,
  url: `https://example.org/${id}`,
  publisher,
  accessedAt: "2026-10-16",
});

const snapshot: CatalogSnapshot = catalogSnapshotSchema.parse({
  countries: [
    { id: "alpha", name: "Alphaland", isoCode: "AL", center: { latitude: 10, longitude: 20 }, summary: "Alpha summary.", sourceIds: ["src-a"] },
    { id: "beta", name: "Betaland", isoCode: null, center: null, summary: "Beta summary.", sourceIds: ["src-a"] },
  ],
  regions: [
    { id: "alpha-high", countryId: "alpha", name: "High Alpha", center: { latitude: 11, longitude: 21 }, summary: "High summary.", sourceIds: ["src-a"] },
    { id: "alpha-low", countryId: "alpha", name: "Low Alpha", center: null, summary: "Low summary.", sourceIds: ["src-a", "src-missing"] },
  ],
  beans: [
    {
      id: "bean-high",
      name: "High Bean",
      description: "Grown high.",
      origin: { countryId: "alpha", regionId: "alpha-high" },
      flavorNotes: ["citrus"],
      varieties: [],
      processingMethods: ["washed"],
      roastDescription: null,
      growingConditions: null,
      sourceIds: ["src-a", "src-missing"],
    },
    {
      id: "bean-country",
      name: "Country Bean",
      description: "Recorded at country level.",
      origin: { countryId: "alpha", regionId: null },
      flavorNotes: [],
      varieties: ["Typica"],
      processingMethods: [],
      roastDescription: "Medium.",
      growingConditions: "Volcanic soil.",
      sourceIds: ["src-a"],
    },
  ],
  drinks: [
    {
      id: "drink-beta",
      name: "Beta Cup",
      description: "Enjoyed in Betaland.",
      associatedLocations: [{ countryId: "beta", regionId: null }],
      flavorNotes: ["sweet"],
      ingredients: ["coffee", "milk"],
      preparation: null,
      culturalContext: "Everyday cup.",
      sourceIds: ["src-b"],
    },
    {
      id: "drink-alpha-wide",
      name: "Alpha Everyday",
      description: "Country-wide.",
      associatedLocations: [{ countryId: "alpha", regionId: null }],
      flavorNotes: [],
      ingredients: [],
      preparation: "Boiled.",
      culturalContext: null,
      sourceIds: ["src-a"],
    },
    {
      id: "drink-low",
      name: "Low Cup",
      description: "Regional.",
      associatedLocations: [{ countryId: "alpha", regionId: "alpha-low" }],
      flavorNotes: [],
      ingredients: [],
      preparation: null,
      culturalContext: null,
      sourceIds: ["src-a"],
    },
  ],
  pairings: [
    { id: "pair-doc", beanId: "bean-high", drinkId: "drink-beta", relationship: "documented", explanation: "Documented explanation.", sourceIds: ["src-b"] },
    { id: "pair-sug", beanId: "bean-high", drinkId: "drink-alpha-wide", relationship: "suggested", explanation: "Suggested explanation.", sourceIds: ["src-a"] },
  ],
  sources: [source("src-a"), source("src-b", null)],
});

const index = indexCatalog(snapshot);
const ready = (preview = false): CatalogLoad => ({ status: "ready", index, preview });
const html = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);
const decode = (markup: string) => markup.replaceAll("&amp;", "&");

function notFoundError(render: () => unknown): unknown {
  try {
    render();
  } catch (error) {
    return error;
  }
  return null;
}

describe("explore world screen", () => {
  it("shows the unavailable notice and still renders the base map without countries", () => {
    const markup = html(createElement(ExploreWorldScreen, { load: { status: "unavailable" } }));
    expect(markup).toContain("The coffee catalog isn’t connected yet.");
    expect(markup).toContain('data-countries="0"');
    expect(markup).not.toContain("Development preview data");
    expect(decode(markup)).toContain('href="/recommendations?type=both&scope=global"');
  });

  it("shows the error notice", () => {
    const markup = html(createElement(ExploreWorldScreen, { load: { status: "error" } }));
    expect(markup).toContain("We couldn’t load the coffee catalog right now.");
    expect(markup).not.toContain("isn’t connected yet");
  });

  it("lists every country with counts and marks list-only countries", () => {
    const markup = html(createElement(ExploreWorldScreen, { load: ready() }));
    expect(markup).toContain('href="/explore/alpha"');
    expect(markup).toContain('href="/explore/beta"');
    expect(markup).toContain("2 regions · 2 beans · 2 drinks");
    // Zero counts are left out: Betaland has one drink and nothing else.
    expect(markup).toContain("1 drink");
    expect(markup).not.toContain("0 regions");
    expect(markup).toContain('data-countries="2"');
    // Betaland has neither an outline code nor a center.
    expect(markup.match(/Not on the map/g)).toHaveLength(1);
    expect(markup).not.toContain("Development preview data");
  });

  it("gives the map its hooks and keeps the world list short", () => {
    const markup = html(createElement(ExploreWorldScreen, { load: ready() }));
    expect(markup).toContain("data-explore-layout");
    expect(markup).toContain('data-map-key="country:alpha"');
    expect(markup).toContain('data-map-key="country:beta"');
    // Summaries are the lead on each country page, not in the world list.
    expect(markup).not.toContain("Alpha summary.");
    expect(markup).toMatch(/<h1 tabindex="-1" data-explore-heading="">/);
    expect(decode(markup)).toContain('href="/recommendations?type=both&scope=global"');
  });

  it("hands the map every region, so a country's regions can appear while its page loads", () => {
    const markup = html(createElement(ExploreWorldScreen, { load: ready() }));
    expect(markup).toContain('data-regions="2"');
  });

  it("labels preview data visibly", () => {
    const markup = html(createElement(ExploreWorldScreen, { load: ready(true) }));
    expect(markup).toContain("Development preview data");
    expect(markup).toContain("Not the project catalog.");
  });
});

describe("explore country and region screens", () => {
  it("separates beans grown here from drinks enjoyed here", () => {
    const markup = html(createElement(ExploreCountryScreen, { load: ready(), countryId: "alpha" }));
    expect(markup).toContain("Grown here");
    expect(markup).toContain("Enjoyed here");
    expect(markup).toContain("doesn’t mean its beans grow here");
    expect(markup).toContain('href="/beans/bean-high"');
    expect(markup).toContain('href="/drinks/drink-low"');
    expect(markup).not.toContain('href="/drinks/drink-beta"');
    expect(markup).toContain('href="/explore/alpha/alpha-low"');
    expect(markup).toContain("Not on the map");
    expect(decode(markup)).toContain('href="/recommendations?type=both&scope=selected&countryId=alpha"');
    expect(markup).toContain('data-focus="{&quot;level&quot;:&quot;country&quot;,&quot;countryId&quot;:&quot;alpha&quot;}"');
  });

  it("marks the heading, list links and back link for the map", () => {
    const markup = html(createElement(ExploreCountryScreen, { load: ready(), countryId: "alpha" }));
    expect(markup).toContain('<h1 tabindex="-1" data-explore-heading="">Alphaland</h1>');
    expect(markup).toContain('data-map-key="region:alpha/alpha-high"');
    // Region lists keep their summaries.
    expect(markup).toContain("High summary.");
    // Low Alpha has a drink and no beans.
    expect(markup).toContain("<span>1 drink</span>");
    expect(markup).not.toContain("0 beans");
    // The back link points back: its arrow comes before the text.
    expect(markup).toMatch(/href="\/explore"><svg[^>]*scaleX\(-1\)[^>]*>.*?<\/svg>Back to the world view<\/a>/);
  });

  it("shows a drinks-only country without empty Regions or Grown here blocks", () => {
    const markup = html(createElement(ExploreCountryScreen, { load: ready(), countryId: "beta" }));
    expect(markup).not.toContain('id="regions-heading"');
    expect(markup).not.toContain("Grown here");
    expect(markup).not.toContain("No beans grown in");
    expect(markup).toContain("No growing regions or beans are recorded for Betaland. The drinks enjoyed here are listed below.");
    expect(markup).toContain("Enjoyed here");
    expect(markup).toContain('href="/drinks/drink-beta"');
    // Betaland has no outline or center, and the page still says so.
    expect(markup).toContain("Betaland isn’t placed on the map yet");
    expect(markup).toContain("<li>1 drink</li>");
  });

  it("renders an honest page when the catalog is unavailable", () => {
    const markup = html(createElement(ExploreCountryScreen, { load: { status: "unavailable" }, countryId: "alpha" }));
    expect(markup).toContain("The coffee catalog isn’t connected yet.");
    expect(markup).not.toContain("data-test-map");
    expect(markup).not.toContain("/recommendations");
  });

  it("calls notFound for an unknown country", () => {
    const error = notFoundError(() => html(createElement(ExploreCountryScreen, { load: ready(), countryId: "gamma" })));
    expect(String((error as { digest?: string })?.digest)).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("shows region drinks and country-wide drinks as separate groups", () => {
    const markup = html(createElement(ExploreRegionScreen, { load: ready(), countryId: "alpha", regionId: "alpha-low" }));
    expect(markup).toContain("Across Alphaland");
    expect(markup).toContain("Associated with the country as a whole, not this region in particular.");
    expect(markup).toContain('href="/drinks/drink-low"');
    expect(markup).toContain('href="/drinks/drink-alpha-wide"');
    expect(markup).toContain('aria-current="location"');
    expect(markup).toContain('data-map-key="region:alpha/alpha-high"');
    expect(markup).toContain("Source record unavailable");
    expect(decode(markup)).toContain(
      'href="/recommendations?type=both&scope=selected&countryId=alpha&regionId=alpha-low"',
    );
  });

  it("folds a region without drinks of its own into the country-wide group", () => {
    const markup = html(createElement(ExploreRegionScreen, { load: ready(), countryId: "alpha", regionId: "alpha-high" }));
    expect(markup).toContain('<h1 tabindex="-1" data-explore-heading="">High Alpha</h1>');
    expect(markup).toContain('data-map-key="region:alpha/alpha-low"');
    // The current region is marked, not linked.
    expect(markup).not.toContain('data-map-key="region:alpha/alpha-high"');
    expect(markup).toContain("Across Alphaland");
    expect(markup).toContain("None are tied to High Alpha specifically; these belong to Alphaland as a whole.");
    expect(markup).not.toContain("No drinks are tied to");
    expect(markup).not.toContain("Associated with the country as a whole");
    expect(markup).toContain('href="/drinks/drink-alpha-wide"');
    expect(markup).toMatch(/<svg[^>]*scaleX\(-1\)[^>]*>.*?<\/svg>Back to Alphaland<\/a>/);
  });

  it("calls notFound for a region under the wrong country", () => {
    const error = notFoundError(() =>
      html(createElement(ExploreRegionScreen, { load: ready(), countryId: "beta", regionId: "alpha-low" })),
    );
    expect(String((error as { digest?: string })?.digest)).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});

describe("detail screens", () => {
  const beanLoad = (id: string): ItemLoad<(typeof snapshot.beans)[number]> => {
    const item = index.beans.get(id);
    if (!item) throw new Error(id);
    return { status: "ready", item, index, preview: false };
  };

  it("shows origin, documented and suggested pairings, sources and the save action", () => {
    const markup = html(createElement(BeanDetailScreen, { load: beanLoad("bean-high") }));
    expect(markup).toContain("Grown in High Alpha, Alphaland");
    expect(markup).toContain("Documented pairings");
    expect(markup).toContain("Suggested pairings");
    expect(markup).toContain("A suggested combination, not a documented tradition.");
    expect(markup).toContain("Enjoyed in Betaland");
    expect(markup).toContain('target="_blank" rel="noopener noreferrer"');
    expect(markup).toContain("Accessed <time");
    expect(markup).toContain("Source record unavailable");
    expect(markup).toContain("Not recorded");
    expect(markup).toContain("Save");
    expect(decode(markup)).toContain(
      'href="/recommendations?type=both&scope=global&countryId=alpha&regionId=alpha-high&beanId=bean-high"',
    );
  });

  it("does not invent a region for a country-level bean", () => {
    const markup = html(createElement(BeanDetailScreen, { load: beanLoad("bean-country") }));
    expect(markup).toContain("Recorded at country level");
    expect(markup).toContain("No pairings are recorded for this bean yet.");
  });

  it("explains that a drink's association is not bean origin", () => {
    const item = index.drinks.get("drink-beta");
    if (!item) throw new Error("drink-beta");
    const markup = html(createElement(DrinkDetailScreen, { load: { status: "ready", item, index, preview: true } }));
    expect(markup).toContain("Where it’s enjoyed");
    expect(markup).toContain("doesn’t identify where the beans in the cup are grown");
    expect(markup).toContain('href="/beans/bean-high"');
    expect(markup).toContain("Grown in High Alpha, Alphaland");
    expect(markup).toContain("Development preview data");
    expect(decode(markup)).toContain('href="/recommendations?type=both&scope=global&drinkId=drink-beta"');
  });

  it("puts the header beside the facts and notes an empty pairing group in its intro", () => {
    const item = index.drinks.get("drink-beta");
    if (!item) throw new Error("drink-beta");
    const markup = html(createElement(DrinkDetailScreen, { load: { status: "ready", item, index, preview: false } }));
    // The header is the first item of the layout grid, ahead of the main column.
    const header = markup.indexOf("<header");
    expect(header).toBeGreaterThan(markup.search(/class="[^"]*layout/));
    expect(header).toBeLessThan(markup.search(/class="[^"]*main/));
    // Drink Beta has a documented pairing only; the suggested group says so in one sentence.
    expect(markup).toContain("A suggested combination, not a documented tradition. None recorded yet.");
    expect(markup).not.toMatch(/class="[^"]*empty[^"]*">None recorded yet\./);
  });

  it("shows three flavor notes and a count of the rest, or a drink's description when it has none", () => {
    const bean = index.beans.get("bean-high");
    if (!bean) throw new Error("bean-high");
    const notes = ["citrus", "floral", "honey", "black tea", "berry"];
    const cards = html(createElement(BeanCards, { beans: [{ ...bean, flavorNotes: notes }], index }));
    expect(cards.match(/<li class="[^"]*chip(?!More)[^"]*">/g)).toHaveLength(3);
    expect(cards).toMatch(/chipMore[^"]*">\+2</);
    expect(cards).not.toContain("black tea");

    const country = html(createElement(ExploreCountryScreen, { load: ready(), countryId: "alpha" }));
    expect(country).toMatch(/cardSummary[^"]*">Country-wide\.</);
    // A bean without notes still says so.
    expect(country).toContain("Flavor notes not recorded");
  });

  it("has a page-shaped loading state that is announced once", () => {
    const bean = html(createElement(DetailSkeleton, { kind: "bean" }));
    expect(bean).toMatch(/^<div class="content-width interior-page [^"]*" role="status" aria-live="polite">/);
    expect(bean).toContain("Loading the bean profile");
    expect(bean).toContain('<div aria-hidden="true">');
    expect(bean).not.toContain("Opening your next stop");
    expect(html(createElement(DetailSkeleton, { kind: "drink" }))).toContain("Loading the drink profile");
  });

  it("renders unavailable and error states without item content", () => {
    expect(html(createElement(BeanDetailScreen, { load: { status: "unavailable" } }))).toContain(
      "The coffee catalog isn’t connected yet.",
    );
    expect(html(createElement(DrinkDetailScreen, { load: { status: "error" } }))).toContain(
      "We couldn’t load the coffee catalog right now.",
    );
  });
});
