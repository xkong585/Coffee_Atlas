import { type ItemReference, stableIdSchema } from "@/contracts";

export type RecommendationSearchParams = Record<string, string | string[] | undefined>;

function safeId(value: string | string[] | undefined): string | undefined {
  const parsed = stableIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export interface InitialSearch {
  itemType: "bean" | "drink" | "both" | null;
  scope: "global" | "selected" | null;
  countryId: string | null;
  regionId: string | null;
  startingItem: ItemReference | null;
}

/**
 * The deep-link query as starting values for the form, with the same rules as
 * getRecommendationContext: invalid or repeated values are dropped, a region
 * needs its country, and two starting items cancel each other out. Missing
 * values stay null so the form can ask instead of guessing.
 */
export function getInitialSearch(params: RecommendationSearchParams): InitialSearch {
  const countryId = safeId(params.countryId) ?? null;
  const regionId = countryId ? safeId(params.regionId) ?? null : null;
  const ambiguous = params.beanId !== undefined && params.drinkId !== undefined;
  const beanId = ambiguous ? undefined : safeId(params.beanId);
  const drinkId = ambiguous ? undefined : safeId(params.drinkId);
  const { type, scope } = params;
  return {
    itemType: type === "bean" || type === "drink" || type === "both" ? type : null,
    scope: scope === "global" || (scope === "selected" && countryId) ? scope : null,
    countryId,
    regionId,
    startingItem: beanId ? { itemType: "bean", itemId: beanId } : drinkId ? { itemType: "drink", itemId: drinkId } : null,
  };
}

/** Display-only context. This neither loads catalog records nor requests recommendations. */
export function getRecommendationContext(params: RecommendationSearchParams) {
  const context: { label: string; value: string }[] = [];
  const countryId = safeId(params.countryId);
  const regionId = countryId ? safeId(params.regionId) : undefined;
  const beanId = safeId(params.beanId);
  const drinkId = safeId(params.drinkId);
  // A URL must identify at most one starting item. Even an invalid second
  // parameter makes the user's intended starting item ambiguous.
  const hasAmbiguousStartingItem = params.beanId !== undefined && params.drinkId !== undefined;

  if (countryId) context.push({ label: "Country reference", value: countryId });
  if (regionId) context.push({ label: "Region reference", value: regionId });
  if (params.scope === "global") context.push({ label: "Search area", value: "All supported locations" });
  if (params.scope === "selected" && countryId) context.push({ label: "Search area", value: "Selected location" });
  if (params.type === "bean" || params.type === "drink" || params.type === "both") {
    context.push({ label: "Looking for", value: params.type === "bean" ? "Coffee beans" : params.type === "drink" ? "Regional drinks" : "Beans and drinks" });
  }
  if (!hasAmbiguousStartingItem && beanId) context.push({ label: "Starting bean reference", value: beanId });
  if (!hasAmbiguousStartingItem && drinkId) context.push({ label: "Starting drink reference", value: drinkId });
  return context;
}
