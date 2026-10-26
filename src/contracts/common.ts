import { z } from "zod";

/** Stable, opaque catalog IDs; consumers must not derive labels or geography from them. */
export const stableIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,79}$/, "Use a stable lowercase ID.");

export const itemReferenceSchema = z.strictObject({
  itemType: z.enum(["bean", "drink"]),
  itemId: stableIdSchema,
});
export type ItemReference = z.infer<typeof itemReferenceSchema>;

export type ErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ServiceError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export interface ApiFailure { ok: false; error: ServiceError }

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

/** Session/access endpoints expose a safe state even when their service is unavailable. */
export type StateApiResult<T> = ApiResult<T> | (ApiFailure & { state: T });

export const success = <T>(data: T): ApiResult<T> => ({ ok: true, data });

export function unavailable(feature: string): ApiFailure {
  return {
    ok: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: `${feature} is not connected in the foundation.`,
      retryable: false,
    },
  };
}
