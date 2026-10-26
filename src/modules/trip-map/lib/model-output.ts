import { z } from "zod";
import type { TripItinerary, TripResponse } from "@/contracts";
import { type Destination, itemKey, placeKey } from "./destinations";

/**
 * The shape the model fills. A plain object (no refinements) so it converts
 * cleanly to a JSON schema; every rule is enforced by validateTripOutput.
 */
export const tripModelOutputSchema = z.object({
  outcome: z.enum(["itinerary", "no-trip"]),
  title: z.string(),
  summary: z.string(),
  stops: z.array(z.object({
    countryId: z.string(),
    /** null for a country-level stop. */
    regionId: z.string().nullable(),
    itemType: z.enum(["bean", "drink"]),
    itemId: z.string(),
    reasons: z.array(z.string()),
  })),
  noTripReason: z.string(),
  suggestions: z.array(z.string()),
});
export type TripModelOutput = z.infer<typeof tripModelOutputSchema>;

const MAX_TEXT = 400;
const MAX_REASONS = 3;
const MAX_TITLE = 120;
const MAX_SUMMARY = 600;

const clip = (value: string, max: number) => value.trim().slice(0, max);

function lines(values: string[], max: number): string[] {
  return values.map((value) => clip(value, MAX_TEXT)).filter(Boolean).slice(0, max);
}

export type TripValidation =
  | { ok: true; response: TripResponse }
  | { ok: false; problem: string };

export interface ValidationContext {
  destinations: Destination[];
  stopCount: number;
  basis: TripItinerary["basis"];
}

/**
 * Accepts the model's plan only when every stop is one of the offered
 * destinations and its recommendation can be tried there. Structural problems
 * (an unknown place, a region outside its country, an item from elsewhere, a
 * repeated or overlapping stop, a stop without a reason, fewer than two
 * stops) reject the whole answer so the caller can retry with the problem
 * stated. Cosmetic issues are repaired: text is trimmed, extra stops are cut
 * to the requested count, an empty title gets a default, and sources and the
 * "saved" flag come from the catalog rather than the model.
 */
export function validateTripOutput(output: TripModelOutput, context: ValidationContext): TripValidation {
  if (output.outcome === "no-trip") {
    const reason = clip(output.noTripReason, MAX_TEXT);
    if (!reason) return { ok: false, problem: "A no-trip answer needs a reason." };
    return { ok: true, response: { status: "no-trip", reason, suggestions: lines(output.suggestions, 3) } };
  }

  const byPlace = new Map(context.destinations.map((entry) => [entry.key, entry]));
  const countryIds = new Set(context.destinations.map((entry) => entry.countryId));
  const seenPlaces = new Set<string>();
  const seenItems = new Set<string>();
  const stops: TripItinerary["stops"] = [];

  for (const [index, stop] of output.stops.slice(0, context.stopCount).entries()) {
    const label = `Stop ${index + 1}`;
    const regionId = stop.regionId?.trim() ? stop.regionId.trim() : null;
    if (!countryIds.has(stop.countryId)) return { ok: false, problem: `${label}: ${stop.countryId} is not one of the destinations.` };
    const key = placeKey(stop.countryId, regionId);
    const destination = byPlace.get(key);
    if (!destination) {
      return { ok: false, problem: `${label}: ${regionId} is not a destination region of ${stop.countryId}.` };
    }
    if (seenPlaces.has(key)) return { ok: false, problem: `${label}: ${destination.label} is used twice.` };
    // "Ethiopia" and "Harar, Ethiopia" in one trip would be the same visit twice.
    const overlaps = regionId ? seenPlaces.has(stop.countryId) : [...seenPlaces].some((seen) => seen.startsWith(`${stop.countryId}/`));
    if (overlaps) return { ok: false, problem: `${label}: ${destination.label} overlaps another stop in the same country. Use either the country or one of its regions.` };

    const wanted = itemKey({ itemType: stop.itemType, itemId: stop.itemId });
    const entry = destination.items.find((candidate) => itemKey(candidate.item) === wanted);
    if (!entry) return { ok: false, problem: `${label}: ${wanted} is not listed for ${destination.label}.` };
    if (seenItems.has(wanted)) return { ok: false, problem: `${label}: ${wanted} is recommended at two stops.` };

    const reasons = lines(stop.reasons, MAX_REASONS);
    if (reasons.length === 0) return { ok: false, problem: `${label}: the stop needs a reason.` };

    seenPlaces.add(key);
    seenItems.add(wanted);
    stops.push({
      order: stops.length + 1,
      countryId: destination.countryId,
      regionId: destination.regionId,
      recommendation: entry.item,
      reasons,
      fromSaved: entry.saved,
      sourceIds: entry.sourceIds,
    });
  }

  if (stops.length < 2) return { ok: false, problem: "An itinerary needs at least two stops." };

  return {
    ok: true,
    response: {
      status: "itinerary",
      itinerary: {
        title: clip(output.title, MAX_TITLE) || "Your coffee trip",
        summary: clip(output.summary, MAX_SUMMARY) || `${stops.length} stops chosen from the atlas for your taste.`,
        stops,
        basis: context.basis,
      },
    },
  };
}
