import type { Bean, CatalogSnapshot, Drink, ItemReference, SavedItem } from "@/contracts";

/**
 * Pure catalog work for the trip map: which places can be stops and what can
 * be tried at each. The model picks and orders from this list only; the
 * validator (model-output.ts) checks every answer against the same list.
 */

export const itemKey = (item: ItemReference) => `${item.itemType}:${item.itemId}`;
export const placeKey = (countryId: string, regionId: string | null) => (regionId ? `${countryId}/${regionId}` : countryId);

export interface TripItem {
  item: ItemReference;
  name: string;
  /** The item's own sources: the only IDs a stop may cite for it. */
  sourceIds: string[];
  saved: boolean;
  /** Compact facts for the model. */
  facts: Record<string, unknown>;
}

export interface Destination {
  key: string;
  countryId: string;
  regionId: string | null;
  /** "Harar, Ethiopia" or "Ethiopia". */
  label: string;
  items: TripItem[];
  /** True when one of the user's saved items can be tried here. */
  hasSaved: boolean;
}

/** A two-stop trip needs non-overlapping places and two different things to try. */
export function hasViableTrip(destinations: readonly Destination[]): boolean {
  for (let left = 0; left < destinations.length; left += 1) {
    const first = destinations[left];
    for (let right = left + 1; right < destinations.length; right += 1) {
      const second = destinations[right];
      if (first.key === second.key) continue;
      if (first.countryId === second.countryId && (first.regionId === null || second.regionId === null)) continue;
      if (first.items.some((a) => second.items.some((b) => itemKey(a.item) !== itemKey(b.item)))) return true;
    }
  }
  return false;
}

const MAX_DESCRIPTION = 220;

function short(text: string | null): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed.length > MAX_DESCRIPTION ? `${trimmed.slice(0, MAX_DESCRIPTION - 1)}…` : trimmed;
}

/** Beans count at a region only when recorded there; at a country they count wherever in it they grow. */
export function beanAt(bean: Bean, countryId: string, regionId: string | null): boolean {
  if (bean.origin.countryId !== countryId) return false;
  return regionId === null || bean.origin.regionId === regionId;
}

/** A country-level drink association covers its regions too; a region association covers its country. */
export function drinkAt(drink: Drink, countryId: string, regionId: string | null): boolean {
  return drink.associatedLocations.some((location) =>
    location.countryId === countryId
    && (regionId === null || location.regionId === null || location.regionId === regionId));
}

function beanItem(bean: Bean, saved: Set<string>): TripItem {
  const item = { itemType: "bean", itemId: bean.id } as const;
  return {
    item,
    name: bean.name,
    sourceIds: bean.sourceIds,
    saved: saved.has(itemKey(item)),
    facts: {
      description: short(bean.description),
      flavorNotes: bean.flavorNotes,
      processingMethods: bean.processingMethods,
      roast: short(bean.roastDescription),
    },
  };
}

function drinkItem(drink: Drink, saved: Set<string>): TripItem {
  const item = { itemType: "drink", itemId: drink.id } as const;
  return {
    item,
    name: drink.name,
    sourceIds: drink.sourceIds,
    saved: saved.has(itemKey(item)),
    facts: {
      description: short(drink.description),
      flavorNotes: drink.flavorNotes,
      ingredients: drink.ingredients,
      culturalContext: short(drink.culturalContext),
    },
  };
}

/** Saved references the catalog still has (a saved item can outlive its record). */
export function resolveSaved(snapshot: CatalogSnapshot, saved: readonly SavedItem[]): ItemReference[] {
  const beans = new Set(snapshot.beans.map((bean) => bean.id));
  const drinks = new Set(snapshot.drinks.map((drink) => drink.id));
  const seen = new Set<string>();
  const resolved: ItemReference[] = [];
  for (const entry of saved) {
    const item = { itemType: entry.itemType, itemId: entry.itemId };
    const known = item.itemType === "bean" ? beans.has(item.itemId) : drinks.has(item.itemId);
    if (!known || seen.has(itemKey(item))) continue;
    seen.add(itemKey(item));
    resolved.push(item);
  }
  return resolved;
}

/**
 * Every country and region with at least one bean or drink, in catalog order.
 * Places without content are left out: a stop must have something to try.
 */
export function buildDestinations(snapshot: CatalogSnapshot, saved: readonly ItemReference[] = []): Destination[] {
  const savedKeys = new Set(saved.map(itemKey));
  const destinations: Destination[] = [];

  const add = (countryId: string, regionId: string | null, label: string) => {
    const items = [
      ...snapshot.beans.filter((bean) => beanAt(bean, countryId, regionId)).map((bean) => beanItem(bean, savedKeys)),
      ...snapshot.drinks.filter((drink) => drinkAt(drink, countryId, regionId)).map((drink) => drinkItem(drink, savedKeys)),
    ];
    if (items.length === 0) return;
    destinations.push({
      key: placeKey(countryId, regionId),
      countryId,
      regionId,
      label,
      items,
      hasSaved: items.some((entry) => entry.saved),
    });
  };

  for (const country of snapshot.countries) {
    add(country.id, null, country.name);
    for (const region of snapshot.regions.filter((entry) => entry.countryId === country.id)) {
      add(country.id, region.id, `${region.name}, ${country.name}`);
    }
  }
  return destinations;
}
