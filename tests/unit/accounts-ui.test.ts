import { describe, expect, it } from "vitest";
import { formatPrice } from "@/modules/accounts/ui/upgrade-panel";
import { safeNext } from "@/modules/accounts/ui/client";

describe("account UI helpers", () => {
  it("formats Stripe minor-unit amounts", () => {
    expect(formatPrice(499, "usd")).toBe("$4.99");
    expect(formatPrice(500, "jpy")).toBe("¥500");
    expect(formatPrice(100, "not-a-currency")).toBeNull();
  });

  it("only follows same-site paths after sign-in", () => {
    expect(safeNext("/saved")).toBe("/saved");
    expect(safeNext("//evil.example")).toBe("/account");
    expect(safeNext("/\\evil.example")).toBe("/account");
    expect(safeNext("/\t/evil.example")).toBe("/account");
    expect(safeNext("/\n/evil.example")).toBe("/account");
    expect(safeNext("/\r/evil.example")).toBe("/account");
    expect(safeNext("/saved?next=beans#favorites")).toBe("/saved?next=beans#favorites");
    expect(safeNext("https://evil.example")).toBe("/account");
    expect(safeNext(null)).toBe("/account");
  });
});
