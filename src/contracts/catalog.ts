import { z } from "zod";
import { stableIdSchema } from "./common";

const sourceIds = z.array(stableIdSchema).min(1);

/** Optional map focus, in decimal degrees. Missing coordinates must not become (0, 0). */
export const coordinatesSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const sourceSchema = z.strictObject({
  id: stableIdSchema,
  title: z.string().min(1),
  url: z.url({ protocol: /^https?$/ }),
  publisher: z.string().nullable(),
  accessedAt: z.iso.date(),
});

export const countrySchema = z.strictObject({
  id: stableIdSchema,
  name: z.string().min(1),
  isoCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
  center: coordinatesSchema.nullable(),
  summary: z.string().min(1),
  sourceIds,
});

export const regionSchema = z.strictObject({
  id: stableIdSchema,
  countryId: stableIdSchema,
  name: z.string().min(1),
  center: coordinatesSchema.nullable(),
  summary: z.string().min(1),
  sourceIds,
});

export const locationReferenceSchema = z.strictObject({
  countryId: stableIdSchema,
  regionId: stableIdSchema.nullable(),
});

export const beanSchema = z.strictObject({
  id: stableIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  /** Where the beans grow, not where a drink is popular. */
  origin: locationReferenceSchema,
  flavorNotes: z.array(z.string().min(1)),
  varieties: z.array(z.string().min(1)),
  processingMethods: z.array(z.string().min(1)),
  roastDescription: z.string().nullable(),
  growingConditions: z.string().nullable(),
  sourceIds,
});

export const drinkSchema = z.strictObject({
  id: stableIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  /** Cultural associations; these do not imply bean provenance. */
  associatedLocations: z.array(locationReferenceSchema).min(1),
  flavorNotes: z.array(z.string().min(1)),
  ingredients: z.array(z.string().min(1)),
  preparation: z.string().nullable(),
  culturalContext: z.string().nullable(),
  sourceIds,
});

export const pairingSchema = z.strictObject({
  id: stableIdSchema,
  beanId: stableIdSchema,
  drinkId: stableIdSchema,
  /** Suggested compatibility is not evidence of a documented tradition. */
  relationship: z.enum(["documented", "suggested"]),
  explanation: z.string().min(1),
  sourceIds,
});

export const catalogSnapshotSchema = z.strictObject({
  countries: z.array(countrySchema),
  regions: z.array(regionSchema),
  beans: z.array(beanSchema),
  drinks: z.array(drinkSchema),
  pairings: z.array(pairingSchema),
  sources: z.array(sourceSchema),
});

export const catalogFilterSchema = z.strictObject({
  countryId: stableIdSchema.optional(),
  regionId: stableIdSchema.optional(),
}).refine((value) => !value.regionId || Boolean(value.countryId), {
  message: "A region filter requires its countryId.",
  path: ["countryId"],
});

export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
export type Coordinates = z.infer<typeof coordinatesSchema>;
export type CatalogFilter = z.infer<typeof catalogFilterSchema>;
export type Bean = z.infer<typeof beanSchema>;
export type Drink = z.infer<typeof drinkSchema>;
export type Country = z.infer<typeof countrySchema>;
export type Region = z.infer<typeof regionSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Pairing = z.infer<typeof pairingSchema>;
export type LocationReference = z.infer<typeof locationReferenceSchema>;
