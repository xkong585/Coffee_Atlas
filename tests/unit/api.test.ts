import { afterEach, describe, expect, it, vi } from "vitest";
import { PAID_CAPABILITY } from "@/contracts";
import { GET as health } from "@/app/api/health/route";
import { GET as catalog } from "@/app/api/catalog/route";
import { GET as session } from "@/app/api/session/route";
import { GET as access } from "@/app/api/access/route";
import { PUT as preferences } from "@/app/api/preferences/route";
import { POST as save, DELETE as remove } from "@/app/api/saved/route";
import { POST as recommend } from "@/app/api/recommendations/route";
import { POST as checkout } from "@/app/api/checkout/route";
import { POST as webhook } from "@/app/api/webhooks/stripe/route";
import { services } from "@/lib/server/services";

afterEach(() => vi.restoreAllMocks());

function bodyRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/test", {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

const preferenceInput = {
  acidity: "low", sweetness: "any", roast: "medium", milk: "dairy",
  flavors: ["chocolate"], preparationMethods: ["espresso"], notes: "",
};

describe("foundation HTTP behavior", () => {
  it("reports which services are configured without calling any provider", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network call"));
    const response = health();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { status: "ok", services: { catalog: "ready", accounts: "not-configured", payments: "not-configured" } },
    });
    expect(network).not.toHaveBeenCalled();
  });

  it("serves the real catalog", async () => {
    const response = await catalog(new Request("http://localhost/api/catalog"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.countries.length).toBeGreaterThan(10);
    expect((await catalog(new Request("http://localhost/api/catalog?countryId=not-a-country"))).status).toBe(404);
  });

  it("returns 400 for malformed JSON and unsupported shapes", async () => {
    const malformed = new Request("http://localhost/api/preferences", { method: "PUT", body: "{" });
    expect((await preferences(malformed)).status).toBe(400);
    expect((await recommend(bodyRequest({}))).status).toBe(400);
    expect((await save(bodyRequest({ itemType: "bean", itemId: "example-bean", userId: "other" }))).status).toBe(400);
    expect((await checkout(bodyRequest({ capability: PAID_CAPABILITY, success: true }))).status).toBe(400);
  });

  it("rejects ambiguous or malformed geographic query input", async () => {
    expect((await catalog(new Request("http://localhost/api/catalog?regionId=example-region"))).status).toBe(400);
    expect((await catalog(new Request("http://localhost/api/catalog?countryId=one&countryId=two"))).status).toBe(400);
    expect((await catalog(new Request("http://localhost/api/catalog?unknown=true"))).status).toBe(400);
  });

  it("keeps valid operations unavailable while accounts and Stripe are not configured", async () => {
    const responses = await Promise.all([
      preferences(bodyRequest(preferenceInput, "PUT")),
      save(bodyRequest({ itemType: "bean", itemId: "example-bean" })),
      remove(bodyRequest({ itemType: "drink", itemId: "example-drink" }, "DELETE")),
      recommend(bodyRequest({ preferences: preferenceInput, itemType: "both", geography: { scope: "global" } })),
      checkout(bodyRequest({ capability: PAID_CAPABILITY })),
      webhook(new Request("http://localhost/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "t=1,v1=fake" }, body: "{}" })),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
    }
  });

  it("returns explicit unavailable identity and denied access even after a fake checkout redirect", async () => {
    const request = new Request("http://localhost/api/access?session_id=pretend&paid=true&userId=admin");
    const sessionResponse = await session(request);
    const accessResponse = await access(request);
    expect(sessionResponse.status).toBe(503);
    expect(accessResponse.status).toBe(503);
    expect(await sessionResponse.json()).toMatchObject({ ok: false, state: { status: "unavailable", user: null } });
    expect(await accessResponse.json()).toMatchObject({ ok: false, state: { status: "unavailable", allowed: false } });
  });

  it("does not leak internal service errors into API responses", async () => {
    vi.spyOn(services.catalog, "list").mockRejectedValueOnce(new Error("private-provider-debug-detail"));
    const response = await catalog(new Request("http://localhost/api/catalog"));
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("INTERNAL_ERROR");
    expect(body).not.toContain("private-provider-debug-detail");
  });
});
