import { z } from "zod";
import type { RecommendationResponse } from "@/contracts";
import { type Candidate, itemKey } from "./candidates";

/**
 * The shape the model is asked to fill. It stays a plain object (no
 * refinements) so it converts cleanly to a JSON schema; every rule the
 * contract needs is enforced afterwards by validateModelOutput.
 */
export const modelOutputSchema = z.object({
  outcome: z.enum(["matches", "no-match"]),
  matches: z.array(z.object({
    itemType: z.enum(["bean", "drink"]),
    itemId: z.string(),
    reasons: z.array(z.string()),
    tradeOffs: z.array(z.string()),
    sourceIds: z.array(z.string()),
  })),
  noMatchReason: z.string(),
  suggestions: z.array(z.string()),
});
export type ModelOutput = z.infer<typeof modelOutputSchema>;

const MAX_TEXT = 400;
const MAX_LINES = 4;

function lines(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean).slice(0, MAX_LINES).map((value) => value.slice(0, MAX_TEXT));
}

export type Validation = { ok: true; response: RecommendationResponse } | { ok: false; problem: string };

/**
 * Accepts the model's answer only when every recommended item is one of the
 * candidates this request offered. Unknown source IDs are dropped (falling
 * back to the item's own sources); an unknown, repeated or unexplained item
 * rejects the whole answer, so the caller can retry or report an error.
 */
export function validateModelOutput(output: ModelOutput, candidates: Candidate[], limit: number): Validation {
  if (output.outcome === "no-match") {
    const reason = output.noMatchReason.trim().slice(0, MAX_TEXT);
    if (!reason) return { ok: false, problem: "A no-match answer needs a reason." };
    return { ok: true, response: { status: "no-match", reason, suggestions: lines(output.suggestions) } };
  }

  const byKey = new Map(candidates.map((entry) => [itemKey(entry.item), entry]));
  const seen = new Set<string>();
  const matches: Extract<RecommendationResponse, { status: "matches" }>["matches"] = [];

  for (const match of output.matches) {
    const key = itemKey({ itemType: match.itemType, itemId: match.itemId });
    const entry = byKey.get(key);
    if (!entry) return { ok: false, problem: `${key} is not one of the candidates.` };
    if (seen.has(key)) return { ok: false, problem: `${key} is recommended twice.` };
    seen.add(key);
    const reasons = lines(match.reasons);
    if (reasons.length === 0) return { ok: false, problem: `${key} has no reason.` };
    const cited = [...new Set(match.sourceIds)].filter((id) => entry.allowedSourceIds.includes(id));
    matches.push({
      item: entry.item,
      reasons,
      tradeOffs: lines(match.tradeOffs),
      sourceIds: cited.length > 0 ? cited : entry.ownSourceIds,
    });
  }

  if (matches.length === 0) return { ok: false, problem: "A matches answer needs at least one match." };
  return { ok: true, response: { status: "matches", matches: matches.slice(0, limit) } };
}
