import { z } from "zod";
import { preferencesSchema } from "./accounts";
import { itemReferenceSchema, stableIdSchema } from "./common";

/**
 * AI trip map (Member 4): a suggested future coffee trip whose stops are
 * existing catalog countries/regions, each with one catalog bean or drink to
 * try there. The model only selects and orders stops; the server validates
 * every ID before anything reaches the browser.
 */

export const TRIP_MIN_STOPS = 2;
export const TRIP_MAX_STOPS = 6;

export const tripRequestSchema = z.strictObject({
  /**
   * Taste for this trip. When omitted, the server reads the signed-in user's
   * saved preferences through the accounts service. Saved items are never sent
   * by the client; the server reads them from the account.
   */
  preferences: preferencesSchema.optional(),
  /** Number of stops wanted; the plan may have fewer when coverage is thin. */
  stopCount: z.number().int().min(TRIP_MIN_STOPS).max(TRIP_MAX_STOPS).default(4),
  /** Whether to plan around the places of the user's saved beans and drinks. */
  useSavedItems: z.boolean().default(true),
});

export const tripStopSchema = z.strictObject({
  /** 1-based position in the route. */
  order: z.number().int().min(1),
  countryId: stableIdSchema,
  /** Null for a country-level stop. A region always belongs to countryId. */
  regionId: stableIdSchema.nullable(),
  /** A bean grown at this stop or a drink associated with it. */
  recommendation: itemReferenceSchema,
  reasons: z.array(z.string().min(1)).min(1).max(3),
  /** True when the recommendation (or this stop) comes from the user's saved items. */
  fromSaved: z.boolean(),
  sourceIds: z.array(stableIdSchema).min(1),
});

export const tripItinerarySchema = z.strictObject({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(600),
  stops: z.array(tripStopSchema).min(TRIP_MIN_STOPS).max(TRIP_MAX_STOPS),
  /** What the plan was based on, so the page can say so honestly. */
  basis: z.strictObject({
    preferences: z.enum(["request", "account", "none"]),
    savedItems: z.number().int().min(0),
  }),
});

export const tripResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("itinerary"), itinerary: tripItinerarySchema }),
  z.strictObject({
    status: z.literal("no-trip"),
    reason: z.string().min(1),
    suggestions: z.array(z.string().min(1)),
  }),
]);

export type TripRequest = z.infer<typeof tripRequestSchema>;
export type TripStop = z.infer<typeof tripStopSchema>;
export type TripItinerary = z.infer<typeof tripItinerarySchema>;
export type TripResponse = z.infer<typeof tripResponseSchema>;
