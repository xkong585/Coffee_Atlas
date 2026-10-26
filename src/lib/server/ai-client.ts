import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * Shared server-side model client for AI recommendations (Member 5) and the AI
 * trip map (Member 4). The key is read from MODEL_API_KEY on the server and is
 * never sent to the browser. Callers get a typed result or a failure kind;
 * provider messages, keys and stack traces never leave this file.
 */

/** Sonnet keeps per-request cost low; set MODEL_NAME (e.g. claude-opus-5-5) to override. */
export const DEFAULT_MODEL = "claude-sonnet-5-5";

export type AiFailure =
  /** MODEL_API_KEY is not set on the server. */
  | { kind: "not-configured" }
  /** The provider could not be reached or rejected the call. */
  | { kind: "provider"; retryable: boolean }
  /** The model declined the request. */
  | { kind: "refused" }
  /** The answer was cut off or did not match the requested shape. */
  | { kind: "invalid-output" };

export type AiResult<T> = { ok: true; data: T } | { ok: false; failure: AiFailure };

export interface StructuredRequest<T> {
  /** Stable instructions. */
  system: string;
  /** Request-specific content, including any user text (wrap it as data). */
  prompt: string;
  /** Plain object schema for the answer. Keep refinements out; validate after. */
  schema: z.ZodType<T>;
  /** Defaults to "medium". */
  effort?: "low" | "medium" | "high";
}

export type GenerateStructured = <T>(request: StructuredRequest<T>) => Promise<AiResult<T>>;

export function aiConfigured(): boolean {
  return Boolean(process.env.MODEL_API_KEY?.trim());
}

let cached: { key: string; client: Anthropic } | null = null;

function client(key: string): Anthropic {
  if (cached?.key !== key) {
    // Recommendations are interactive: fail within a minute rather than leave the page waiting.
    cached = { key, client: new Anthropic({ apiKey: key, timeout: 60_000, maxRetries: 1 }) };
  }
  return cached.client;
}

function providerFailure(error: unknown): AiFailure {
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
    return { kind: "provider", retryable: true };
  }
  if (error instanceof Anthropic.APIConnectionError) return { kind: "provider", retryable: true };
  if (error instanceof Anthropic.APIError) {
    // 401/403 (bad key), 404 (unknown MODEL_NAME), 400: retrying cannot help.
    return { kind: "provider", retryable: error.status === 408 || error.status === 409 };
  }
  // Anything else comes from parsing the answer (invalid JSON or schema mismatch).
  return { kind: "invalid-output" };
}

export const generateStructured: GenerateStructured = async <T>({ system, prompt, schema, effort = "medium" }: StructuredRequest<T>) => {
  const key = process.env.MODEL_API_KEY?.trim();
  if (!key) return { ok: false, failure: { kind: "not-configured" } };

  try {
    const response = await client(key).beta.messages.parse({
      model: process.env.MODEL_NAME?.trim() || DEFAULT_MODEL,
      max_tokens: 16000,
      // On a policy decline, let the API re-run the request on its recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort, format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") return { ok: false, failure: { kind: "refused" } };
    if (response.stop_reason === "max_tokens" || response.parsed_output === null) {
      return { ok: false, failure: { kind: "invalid-output" } };
    }
    return { ok: true, data: response.parsed_output as T };
  } catch (error) {
    return { ok: false, failure: providerFailure(error) };
  }
};
