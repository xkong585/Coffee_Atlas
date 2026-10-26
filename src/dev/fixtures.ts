import "server-only";
import {
  catalogSnapshotSchema,
  preferencesSchema,
  recommendationRequestSchema,
} from "@/contracts";

export function developmentFixturesEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.ENABLE_DEV_FIXTURES === "true";
}

/** Contract examples only. Never fall back to these records in a real service adapter. */
export function getDevelopmentFixtures() {
  if (!developmentFixturesEnabled()) return null;

  const catalog = catalogSnapshotSchema.parse({
    countries: [{
      id: "example-country", name: "Example Country", isoCode: null, center: null,
      summary: "Synthetic country used to illustrate the catalog contract.",
      sourceIds: ["example-source"],
    }],
    regions: [{
      id: "example-region", countryId: "example-country", name: "Example Highlands", center: null,
      summary: "Synthetic region; this is not a real growing area.", sourceIds: ["example-source"],
    }],
    beans: [{
      id: "example-bean", name: "Example Bean", description: "Synthetic bean record for development.",
      origin: { countryId: "example-country", regionId: "example-region" },
      flavorNotes: ["chocolate", "citrus"], varieties: [], processingMethods: [],
      roastDescription: null, growingConditions: null, sourceIds: ["example-source"],
    }],
    drinks: [{
      id: "example-drink", name: "Example Milk Coffee",
      description: "Synthetic drink record, not a claim about regional traditions.",
      associatedLocations: [{ countryId: "example-country", regionId: null }],
      flavorNotes: ["creamy"], ingredients: ["coffee", "milk"], preparation: null,
      culturalContext: null, sourceIds: ["example-source"],
    }],
    pairings: [{
      id: "example-pairing", beanId: "example-bean", drinkId: "example-drink",
      relationship: "suggested", explanation: "Illustrative compatibility only; not a documented tradition.",
      sourceIds: ["example-source"],
    }],
    sources: [{
      id: "example-source", title: "Synthetic development source — not evidence",
      url: "https://example.invalid/development-fixture", publisher: null, accessedAt: "2026-10-16",
    }],
  });

  const preferences = preferencesSchema.parse({
    acidity: "low", sweetness: "medium", roast: "medium", milk: "dairy",
    flavors: ["chocolate", "nutty"], preparationMethods: ["espresso"],
    notes: "Example input: I like milk coffee and want to try a different drink.",
  });

  return {
    kind: "synthetic-development-fixtures" as const,
    notice: "Examples only. Not researched coffee content, real recommendations, accounts, or paid access.",
    catalog,
    preferences,
    recommendationRequest: recommendationRequestSchema.parse({
      preferences, itemType: "both",
      geography: { scope: "selected", countryId: "example-country", regionId: "example-region" },
      startingItem: { itemType: "bean", itemId: "example-bean" }, limit: 3,
    }),
  };
}
