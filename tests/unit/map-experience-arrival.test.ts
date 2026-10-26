import { describe, expect, it } from "vitest";
import {
  type ArrivalInput,
  arrivalScroll,
  INTENT_MAX_AGE_MS,
  matchIntent,
  NARROW_SCROLL_MARGIN,
  type PendingIntent,
  STICKY_MAP_TOP,
} from "@/modules/map-experience/ui/map/arrival";

/** A phone at scrollY 470 whose map frame sat 12px from the top at the click (document offset 482). */
const input = (overrides: Partial<ArrivalInput> = {}): ArrivalInput => ({
  origin: "map",
  wide: false,
  reducedMotion: false,
  scrollY: 470,
  frameTopThen: 12,
  frameDocTopThen: 482,
  frameTopNow: 12,
  layoutTop: -300,
  pinTarget: null,
  ...overrides,
});

describe("arrivalScroll: map taps on a phone", () => {
  it("absorbs a shorter head above the map, so the frame stays where it was on screen", () => {
    // The new head is 65px shorter: the frame moved up from 12 to -53 in the viewport.
    expect(arrivalScroll(input({ frameTopNow: -53 }))).toEqual([{ top: 405, behavior: "instant" }]);
  });

  it("absorbs a taller head too", () => {
    expect(arrivalScroll(input({ frameTopNow: 40 }))).toEqual([{ top: 498, behavior: "instant" }]);
  });

  it("does nothing when the layout above the map didn't change", () => {
    expect(arrivalScroll(input())).toEqual([]);
  });

  it("keeps scrolling the viewer did while the page loaded, compensating only the layout shift", () => {
    // Scrolled 400px further down while waiting; the new head is 24px shorter.
    const result = arrivalScroll(input({ scrollY: 870, frameTopNow: 482 - 24 - 870 }));
    expect(result).toEqual([{ top: 846, behavior: "instant" }]);
  });

  it("absorbs the shift at once, then finishes the tap's own scroll while it still runs", () => {
    // Halfway up to 470 when the page arrives, 65px shorter: the frame stays put, then the glide carries on.
    const result = arrivalScroll(input({ scrollY: 235, frameTopNow: 482 - 65 - 235, pinTarget: 470 }));
    expect(result).toEqual([
      { top: 170, behavior: "instant" },
      { top: 405, behavior: "smooth" },
    ]);
  });

  it("only absorbs the shift when the tap's scroll has reached its target but isn't marked done yet", () => {
    // No glide back down past the pinned spot: one instant step.
    expect(arrivalScroll(input({ frameTopNow: -53, pinTarget: 470 }))).toEqual([{ top: 405, behavior: "instant" }]);
  });

  it("leaves a running tap scroll alone when the layout above the map didn't change", () => {
    expect(arrivalScroll(input({ scrollY: 235, frameTopNow: 482 - 235, pinTarget: 470 }))).toEqual([]);
  });

  it("does nothing without a frame (the map couldn't load)", () => {
    expect(arrivalScroll(input({ frameTopNow: null }))).toEqual([]);
  });
});

describe("arrivalScroll: wide screens", () => {
  const wide = (overrides: Partial<ArrivalInput>) => input({ wide: true, frameTopThen: 24, frameTopNow: 24, ...overrides });

  it("glides the new heading into view under the sticky map, for map and panel links", () => {
    for (const origin of ["map", "panel"] as const) {
      expect(arrivalScroll(wide({ origin, scrollY: 700, layoutTop: -560 }))).toEqual([
        { top: 700 - 560 - STICKY_MAP_TOP, behavior: "smooth" },
      ]);
    }
  });

  it("puts a displaced sticky map back at once", () => {
    expect(arrivalScroll(wide({ scrollY: 700, layoutTop: -560, frameTopNow: -40 }))).toEqual([
      { top: 700 - 560 - STICKY_MAP_TOP, behavior: "instant" },
    ]);
  });

  it("jumps for reduced motion", () => {
    expect(arrivalScroll(wide({ scrollY: 700, layoutTop: -560, reducedMotion: true }))).toEqual([
      { top: 700 - 560 - STICKY_MAP_TOP, behavior: "auto" },
    ]);
  });

  it("does nothing when the layout's top is already in view, or there is no layout", () => {
    expect(arrivalScroll(wide({ layoutTop: 40 }))).toEqual([]);
    expect(arrivalScroll(wide({ layoutTop: 0 }))).toEqual([]);
    expect(arrivalScroll(wide({ layoutTop: null }))).toEqual([]);
  });
});

describe("arrivalScroll: other origins", () => {
  it("brings the new heading into view after a panel link on a phone", () => {
    expect(arrivalScroll(input({ origin: "panel", scrollY: 900, layoutTop: -500 }))).toEqual([
      { top: 900 - 500 - NARROW_SCROLL_MARGIN, behavior: "instant" },
    ]);
    expect(arrivalScroll(input({ origin: "panel", layoutTop: 10 }))).toEqual([]);
  });

  it("leaves links outside the panel to Next's own scroll handling", () => {
    expect(arrivalScroll(input({ origin: "other", frameTopNow: -53 }))).toEqual([]);
    expect(arrivalScroll(input({ origin: "other", wide: true, layoutTop: -500 }))).toEqual([]);
  });
});

describe("matchIntent", () => {
  const intent: PendingIntent = { pathname: "/explore/kenya", origin: "map", frameTop: 12, frameDocTop: 482, at: 1000 };

  it("returns the intent for its own page", () => {
    expect(matchIntent(intent, "/explore/kenya", 1500)).toBe(intent);
  });

  it("keeps a slow navigation's intent well past the dimming timeout", () => {
    expect(matchIntent(intent, "/explore/kenya", 1000 + 15_000)).toBe(intent);
  });

  it("ignores another page's intent, a stale one, and none", () => {
    expect(matchIntent(intent, "/explore/ethiopia", 1500)).toBeNull();
    expect(matchIntent(intent, "/explore/kenya", 1000 + INTENT_MAX_AGE_MS)).toBeNull();
    expect(matchIntent(null, "/explore/kenya", 1500)).toBeNull();
  });
});
