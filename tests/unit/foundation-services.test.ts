import { afterEach, describe, expect, it, vi } from "vitest";
import { PAID_CAPABILITY, preferencesSchema, recommendationRequestSchema } from "@/contracts";
import { services } from "@/lib/server/services";

afterEach(() => vi.restoreAllMocks());

describe("unconfigured account adapters", () => {
  it("cannot acquire identity or paid access from client claims", async () => {
    const request = new Request("http://localhost/api/access?userId=admin&paid=true&session_id=fake", {
      headers: { cookie: "userId=admin; paid=true", "x-user-id": "admin", "x-paid": "true" },
    });
    await expect(services.accounts.getSession(request)).resolves.toEqual({ status: "unavailable", user: null });
    await expect(services.accounts.getAccess(request)).resolves.toEqual({
      capability: PAID_CAPABILITY, status: "unavailable", allowed: false,
    });
  });

  it("makes no network calls and returns no fabricated service success", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network call"));
    const request = new Request("http://localhost");
    const preferences = preferencesSchema.parse({
      acidity: "any", sweetness: "any", roast: "any", milk: "any",
      flavors: ["chocolate"], preparationMethods: [], notes: "",
    });
    const reference = { itemType: "bean" as const, itemId: "example-bean" };
    const results = await Promise.all([
      services.accounts.getPreferences(request), services.accounts.savePreferences(request, preferences),
      services.accounts.listSaved(request), services.accounts.saveItem(request, reference),
      services.accounts.removeSaved(request, reference),
      services.accounts.createCheckout(request, { capability: PAID_CAPABILITY }),
      services.recommendations.recommend(request, recommendationRequestSchema.parse({
        preferences, itemType: "both", geography: { scope: "global" },
      })),
    ]);
    // Recommendations check the account quota before the model, so no model call happens either.
    for (const result of results) expect(result).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
    expect(network).not.toHaveBeenCalled();
    expect(await services.catalog.getBean("example-bean")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
