import { z } from "zod";
import { itemReferenceSchema, stableIdSchema } from "./common";
import { preferencesSchema } from "./accounts";

export const recommendationGeographySchema = z.strictObject({
  scope: z.enum(["global", "selected"]),
  countryId: stableIdSchema.optional(),
  regionId: stableIdSchema.optional(),
}).refine((value) => !value.regionId || Boolean(value.countryId), {
  message: "A region requires its countryId.", path: ["countryId"],
}).refine((value) => value.scope !== "selected" || Boolean(value.countryId), {
  message: "Selected-area recommendations require a countryId.", path: ["countryId"],
});

export const recommendationRequestSchema = z.strictObject({
  preferences: preferencesSchema,
  itemType: z.enum(["bean", "drink", "both"]),
  geography: recommendationGeographySchema,
  startingItem: itemReferenceSchema.optional(),
  limit: z.number().int().min(1).max(10).default(3),
});

export const recommendationMatchSchema = z.strictObject({
  item: itemReferenceSchema,
  reasons: z.array(z.string().min(1)).min(1),
  tradeOffs: z.array(z.string().min(1)),
  sourceIds: z.array(stableIdSchema).min(1),
});

export const recommendationResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("matches"),
    matches: z.array(recommendationMatchSchema).min(1).max(10),
  }),
  z.strictObject({
    status: z.literal("no-match"),
    reason: z.string().min(1),
    suggestions: z.array(z.string().min(1)),
  }),
]);

export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;
export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>;
