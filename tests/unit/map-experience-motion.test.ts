import { describe, expect, it } from "vitest";
import { type CameraTarget, easeOutCubic, flightPlan } from "@/modules/map-experience/ui/map/motion";

const camera = (lng: number, lat: number, zoom: number): CameraTarget => ({ center: [lng, lat], zoom });

const duration = (plan: ReturnType<typeof flightPlan>) => {
  if (plan.kind === "jump") throw new Error("expected a move");
  return plan.duration;
};

describe("flightPlan", () => {
  // About 3.6° apart at the same zoom.
  const sibling = flightPlan(camera(38.5, 6.7, 5.6), camera(41.2, 9.1, 5.6), false);
  const intoCountry = flightPlan(camera(55, 12.5, 1.3), camera(39, 9, 4.7), false);
  const acrossGlobe = flightPlan(camera(-52, -14, 4), camera(114, -1, 4.2), false);

  it("eases a short step between sibling regions", () => {
    expect(sibling.kind).toBe("ease");
    expect(duration(sibling)).toBeGreaterThanOrEqual(550);
    expect(duration(sibling)).toBeLessThanOrEqual(850);
  });

  it("flies from the world globe into a country, taking longer than a sibling step", () => {
    expect(intoCountry.kind).toBe("fly");
    expect(duration(intoCountry)).toBeGreaterThanOrEqual(1000);
    expect(duration(intoCountry)).toBeLessThanOrEqual(1600);
    expect(duration(intoCountry)).toBeGreaterThan(duration(sibling));
  });

  it("caps a flight across the globe, which takes at least as long as one into a country", () => {
    expect(acrossGlobe.kind).toBe("fly");
    expect(duration(acrossGlobe)).toBeLessThanOrEqual(1600);
    expect(duration(acrossGlobe)).toBeGreaterThanOrEqual(duration(intoCountry));
  });

  it("takes longer for an ease that moves and zooms further", () => {
    const near = flightPlan(camera(38, 7, 5.4), camera(38.5, 7.2, 5.4), false);
    const far = flightPlan(camera(38, 7, 5.4), camera(44, 9, 6.4), false);
    expect(near.kind).toBe("ease");
    expect(far.kind).toBe("ease");
    expect(duration(far)).toBeGreaterThan(duration(near));
  });

  it("flies, rather than eases, a large zoom change in place", () => {
    const plan = flightPlan(camera(39, 9, 4.5), camera(39, 9, 1.3), false);
    expect(plan.kind).toBe("fly");
  });

  it("keeps every duration whole and inside its range", () => {
    const from = camera(0, 0, 1);
    for (const to of [camera(0.5, 0, 1), camera(10, 5, 2.4), camera(90, 30, 5), camera(179, -60, 9)]) {
      const plan = flightPlan(from, to, false);
      if (plan.kind === "jump") throw new Error("expected a move");
      expect(Number.isInteger(plan.duration)).toBe(true);
      const [min, max] = plan.kind === "ease" ? [550, 850] : [1000, 1600];
      expect(plan.duration).toBeGreaterThanOrEqual(min);
      expect(plan.duration).toBeLessThanOrEqual(max);
    }
  });

  it("jumps when the viewer prefers reduced motion", () => {
    expect(flightPlan(camera(55, 12.5, 1.3), camera(39, 9, 4.7), true)).toEqual({ kind: "jump" });
    expect(flightPlan(camera(38.5, 6.7, 5.6), camera(41.2, 9.1, 5.6), true)).toEqual({ kind: "jump" });
  });

  it("jumps when the camera is already there", () => {
    expect(flightPlan(camera(39, 9, 4.7), camera(39, 9, 4.7), false)).toEqual({ kind: "jump" });
    expect(flightPlan(camera(39, 9, 4.7), camera(39.001, 9.001, 4.705), false)).toEqual({ kind: "jump" });
  });

  it("jumps instead of animating toward an invalid camera", () => {
    expect(flightPlan(camera(39, 9, 4.7), camera(Number.NaN, 9, 4.7), false)).toEqual({ kind: "jump" });
    expect(flightPlan(camera(39, 9, 4.7), camera(39, 9, Number.POSITIVE_INFINITY), false)).toEqual({ kind: "jump" });
  });
});

describe("easeOutCubic", () => {
  it("starts at 0, ends at 1 and slows down toward the end", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(easeOutCubic(0.25) - easeOutCubic(0)).toBeGreaterThan(easeOutCubic(1) - easeOutCubic(0.75));
  });
});
