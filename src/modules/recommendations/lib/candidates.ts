import type {
  Bean,
  CatalogSnapshot,
  Drink,
  ItemReference,
  Preferences,
  RecommendationRequest,
} from "@/contracts";

/**
 * Pure catalog work for recommendations: checking the request's references,
 * choosing the eligible items, and describing them for the model. The model
 * only ranks and explains what this code selected; it never adds items.
 */

export const itemKey = (item: ItemReference) => `${item.itemType}:${item.itemId}`;

export interface Candidate {
  item: ItemReference;
  name: string;
  /** Sources the model may cite for this item: its own and those of its pairings. */
  allowedSourceIds: string[];
  /** The item's own sources, used when every cited source is unknown. */
  ownSourceIds: string[];
  /** Compact facts from the catalog record, sent to the model. */
  facts: Record<string, unknown>;
}

export interface CandidateSet {
  candidates: Candidate[];
  startingItem: { item: ItemReference; name: string; facts: Record<string, unknown> } | null;
  /** Human-readable search area, e.g. "Harar, Ethiopia" or "all supported locations". */
  areaLabel: string;
  /** The place the user was browsing, when the search is global. */
  browsingLabel: string | null;
}

/** Returns a message when the request names places or items the catalog does not have. */
export function checkReferences(snapshot: CatalogSnapshot, input: RecommendationRequest): string | null {
  const { countryId, regionId } = input.geography;
  if (countryId && !snapshot.countries.some((country) => country.id === countryId)) {
    return "The selected country isn’t in the catalog.";
  }
  if (regionId && !snapshot.regions.some((region) => region.id === regionId && region.countryId === countryId)) {
    return "The selected region isn’t part of the selected country in the catalog.";
  }
  const start = input.startingItem;
  if (start) {
    const exists = start.itemType === "bean"
      ? snapshot.beans.some((bean) => bean.id === start.itemId)
      : snapshot.drinks.some((drink) => drink.id === start.itemId);
    if (!exists) return `The starting ${start.itemType} isn’t in the catalog.`;
  }
  return null;
}

/** True when the preferences say anything at all beyond "any". */
export function hasUsablePreferences(preferences: Preferences): boolean {
  return preferences.acidity !== "any"
    || preferences.sweetness !== "any"
    || preferences.roast !== "any"
    || preferences.milk !== "any"
    || preferences.flavors.length > 0
    || preferences.preparationMethods.length > 0
    || preferences.notes.trim().length > 0;
}

function placeLabel(snapshot: CatalogSnapshot, countryId: string, regionId: string | null | undefined): string {
  const country = snapshot.countries.find((entry) => entry.id === countryId)?.name ?? countryId;
  if (!regionId) return country;
  const region = snapshot.regions.find((entry) => entry.id === regionId)?.name ?? regionId;
  return `${region}, ${country}`;
}

function beanInArea(bean: Bean, countryId: string, regionId: string | undefined): boolean {
  if (bean.origin.countryId !== countryId) return false;
  // A bean recorded at country level is not known to grow in any one region.
  return !regionId || bean.origin.regionId === regionId;
}

function drinkInArea(drink: Drink, countryId: string, regionId: string | undefined): boolean {
  // A country-level association covers the whole country, including its regions.
  return drink.associatedLocations.some((location) =>
    location.countryId === countryId && (!regionId || location.regionId === null || location.regionId === regionId));
}

function pairingFacts(snapshot: CatalogSnapshot, item: ItemReference) {
  const pairings = snapshot.pairings.filter((pairing) =>
    item.itemType === "bean" ? pairing.beanId === item.itemId : pairing.drinkId === item.itemId);
  return pairings.map((pairing) => {
    const otherId = item.itemType === "bean" ? pairing.drinkId : pairing.beanId;
    const other = item.itemType === "bean"
      ? snapshot.drinks.find((drink) => drink.id === otherId)
      : snapshot.beans.find((bean) => bean.id === otherId);
    return {
      with: { itemType: item.itemType === "bean" ? "drink" : "bean", itemId: otherId, name: other?.name ?? null },
      relationship: pairing.relationship,
      explanation: pairing.explanation,
      sourceIds: pairing.sourceIds,
    };
  });
}

function beanFacts(snapshot: CatalogSnapshot, bean: Bean): Record<string, unknown> {
  return {
    description: bean.description,
    grownIn: placeLabel(snapshot, bean.origin.countryId, bean.origin.regionId),
    flavorNotes: bean.flavorNotes,
    varieties: bean.varieties,
    processingMethods: bean.processingMethods,
    roastDescription: bean.roastDescription,
    growingConditions: bean.growingConditions,
    pairings: pairingFacts(snapshot, { itemType: "bean", itemId: bean.id }),
  };
}

function drinkFacts(snapshot: CatalogSnapshot, drink: Drink): Record<string, unknown> {
  return {
    description: drink.description,
    culturallyAssociatedWith: drink.associatedLocations.map((location) =>
      placeLabel(snapshot, location.countryId, location.regionId)),
    flavorNotes: drink.flavorNotes,
    ingredients: drink.ingredients,
    preparation: drink.preparation,
    culturalContext: drink.culturalContext,
    pairings: pairingFacts(snapshot, { itemType: "drink", itemId: drink.id }),
  };
}

function candidate(snapshot: CatalogSnapshot, item: ItemReference, name: string, own: string[], facts: Record<string, unknown>): Candidate {
  const pairingSources = (facts.pairings as { sourceIds: string[] }[]).flatMap((pairing) => pairing.sourceIds);
  return {
    item,
    name,
    ownSourceIds: own,
    allowedSourceIds: [...new Set([...own, ...pairingSources])].filter((id) => snapshot.sources.some((source) => source.id === id)),
    facts,
  };
}

/** Eligible items for a reference-checked request (see checkReferences). */
export function selectCandidates(snapshot: CatalogSnapshot, input: RecommendationRequest): CandidateSet {
  const { scope, countryId, regionId } = input.geography;
  const restrict = scope === "selected" && countryId ? { countryId, regionId } : null;
  const start = input.startingItem ? itemKey(input.startingItem) : null;
  const candidates: Candidate[] = [];

  if (input.itemType !== "drink") {
    for (const bean of snapshot.beans) {
      const item = { itemType: "bean", itemId: bean.id } as const;
      if (itemKey(item) === start || (restrict && !beanInArea(bean, restrict.countryId, restrict.regionId))) continue;
      candidates.push(candidate(snapshot, item, bean.name, bean.sourceIds, beanFacts(snapshot, bean)));
    }
  }
  if (input.itemType !== "bean") {
    for (const drink of snapshot.drinks) {
      const item = { itemType: "drink", itemId: drink.id } as const;
      if (itemKey(item) === start || (restrict && !drinkInArea(drink, restrict.countryId, restrict.regionId))) continue;
      candidates.push(candidate(snapshot, item, drink.name, drink.sourceIds, drinkFacts(snapshot, drink)));
    }
  }

  let startingItem: CandidateSet["startingItem"] = null;
  if (input.startingItem) {
    const ref = input.startingItem;
    const bean = ref.itemType === "bean" ? snapshot.beans.find((entry) => entry.id === ref.itemId) : undefined;
    const drink = ref.itemType === "drink" ? snapshot.drinks.find((entry) => entry.id === ref.itemId) : undefined;
    if (bean) startingItem = { item: ref, name: bean.name, facts: beanFacts(snapshot, bean) };
    if (drink) startingItem = { item: ref, name: drink.name, facts: drinkFacts(snapshot, drink) };
  }

  return {
    candidates,
    startingItem,
    areaLabel: restrict ? placeLabel(snapshot, restrict.countryId, restrict.regionId) : "all supported locations",
    browsingLabel: !restrict && countryId ? placeLabel(snapshot, countryId, regionId) : null,
  };
}
