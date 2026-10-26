import { describe, expect, it, vi } from "vitest";
import {
  type AccountsService,
  type ApiResult,
  catalogSnapshotSchema,
  FREE_RECOMMENDATION_LIMIT,
  type RecommendationAllowance,
  recommendationRequestSchema,
} from "@/contracts";
import type { GenerateStructured } from "@/lib/server/ai-client";
import { CATALOG_RECORDS } from "@/modules/catalog/data/records";
import { createRecommendationService } from "@/modules/recommendations/server/service";

const snapshot = catalogSnapshotSchema.parse(CATALOG_RECORDS);
const bean = snapshot.beans[0];
const input = recommendationRequestSchema.parse({
  preferences: { acidity: "low", sweetness: "any", roast: "any", milk: "any", flavors: ["chocolate"], preparationMethods: [], notes: "" },
  itemType: "bean",
  geography: { scope: "global" },
  limit: 1,
});

const allowance = (paid: boolean, freeRemaining: number): ApiResult<RecommendationAllowance> => ({
  ok: true,
  data: { paid, freeLimit: FREE_RECOMMENDATION_LIMIT, freeUsed: FREE_RECOMMENDATION_LIMIT - freeRemaining, freeRemaining },
});

function setup(state: ApiResult<RecommendationAllowance>, outcome: "matches" | "no-match" = "matches") {
  const generate = vi.fn(async () => ({
    ok: true,
    data: {
      outcome,
      matches: outcome === "matches"
        ? [{ itemType: "bean", itemId: bean.id, reasons: ["Fits your taste."], tradeOffs: [], sourceIds: bean.sourceIds }]
        : [],
      noMatchReason: outcome === "no-match" ? "Nothing fits." : "",
      suggestions: [],
    },
  })) as unknown as GenerateStructured;
  const quota = {
    getRecommendationAllowance: vi.fn<AccountsService["getRecommendationAllowance"]>(async () => state),
    recordRecommendationUse: vi.fn<AccountsService["recordRecommendationUse"]>(async () => state),
  };
  const service = createRecommendationService({
    loadCatalog: async () => ({ status: "ready", snapshot, preview: false }),
    generate,
    quota,
  });
  return { service, generate, quota };
}

const request = new Request("http://localhost/api/recommendations", { method: "POST" });

describe("AI recommendation quota (the paid benefit)", () => {
  it("asks signed-out users to sign in, without calling the model", async () => {
    const { service, generate } = setup({ ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in.", retryable: false } });
    const result = await service.recommend(request, input);
    expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    expect(!result.ok && result.error.message).toContain(`first ${FREE_RECOMMENDATION_LIMIT} are free`);
    expect(generate).not.toHaveBeenCalled();
  });

  it("passes through accounts being unavailable", async () => {
    const { service, generate } = setup({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Down.", retryable: false } });
    expect(await service.recommend(request, input)).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
    expect(generate).not.toHaveBeenCalled();
  });

  it("stops at the free limit with FORBIDDEN, without calling the model", async () => {
    const { service, generate, quota } = setup(allowance(false, 0));
    expect(await service.recommend(request, input)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(generate).not.toHaveBeenCalled();
    expect(quota.recordRecommendationUse).not.toHaveBeenCalled();
  });

  it("uses one free recommendation per answer with matches", async () => {
    const { service, quota } = setup(allowance(false, 1));
    expect(await service.recommend(request, input)).toMatchObject({ ok: true, data: { status: "matches" } });
    expect(quota.recordRecommendationUse).toHaveBeenCalledTimes(1);
    expect(quota.recordRecommendationUse).toHaveBeenCalledWith(request);
  });

  it("does not use one up for a no-match answer", async () => {
    const { service, quota } = setup(allowance(false, 1), "no-match");
    expect(await service.recommend(request, input)).toMatchObject({ ok: true, data: { status: "no-match" } });
    expect(quota.recordRecommendationUse).not.toHaveBeenCalled();
  });

  it.each(["FORBIDDEN", "UNAUTHENTICATED", "SERVICE_UNAVAILABLE"] as const)(
    "does not deliver matches when recording the use fails with %s", async (code) => {
      const { service, quota } = setup(allowance(false, 1));
      const failure = { ok: false as const, error: { code, message: "Use could not be recorded.", retryable: false } };
      quota.recordRecommendationUse.mockResolvedValue(failure);
      expect(await service.recommend(request, input)).toEqual(failure);
    },
  );

  it("lets paid users through after the free ones are gone", async () => {
    const { service, generate } = setup(allowance(true, 0));
    expect(await service.recommend(request, input)).toMatchObject({ ok: true, data: { status: "matches" } });
    expect(generate).toHaveBeenCalled();
  });
});
