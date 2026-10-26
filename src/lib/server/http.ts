import "server-only";
import type { z } from "zod";
import { success, unavailable, type ApiFailure, type ApiResult, type ErrorCode } from "@/contracts";

const errorStatus: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

const headers = { "Cache-Control": "no-store" };

export function respond<T>(result: ApiResult<T>): Response {
  return Response.json(result, { status: result.ok ? 200 : errorStatus[result.error.code], headers });
}

/** Same as respond, plus a Set-Cookie header (session sign-in and sign-out). */
export function respondWithCookie<T>(result: ApiResult<T>, cookie: string | null): Response {
  const response = respond(result);
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}

export function unavailableWithState<T>(feature: string, state: T): Response {
  return Response.json({ ...unavailable(feature), state }, { status: 503, headers });
}

export function invalidInput(message = "The request does not match the expected input."): ApiFailure {
  return { ok: false, error: { code: "INVALID_INPUT", message, retryable: false } };
}

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): ApiResult<T> {
  const parsed = schema.safeParse(input);
  return parsed.success ? success(parsed.data) : invalidInput();
}

export function parseQuery<T>(schema: z.ZodType<T>, request: Request): ApiResult<T> {
  const search = new URL(request.url).searchParams;
  const keys = [...search.keys()];
  if (new Set(keys).size !== keys.length) return invalidInput("Query parameters must not repeat.");
  return parseInput(schema, Object.fromEntries(search));
}

export async function parseJson<T>(schema: z.ZodType<T>, request: Request): Promise<ApiResult<T>> {
  try { return parseInput(schema, await request.json()); }
  catch { return invalidInput("A valid JSON request body is required."); }
}

/** Do not expose provider errors, environment values, or stack traces to browsers. */
export async function safeRoute(operation: () => Promise<Response>): Promise<Response> {
  try { return await operation(); }
  catch {
    return respond({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "The request could not be completed.", retryable: true },
    });
  }
}
