import type { IntentOrigin } from "./types";

/**
 * What happens to the page's scroll position when a navigation the map
 * started arrives. Pure (the component reads the DOM and applies the result),
 * so every branch can be unit tested.
 */

/** Two columns with a sticky map, 24px from the top (explore.module.css). */
export const WIDE_LAYOUT_QUERY = "(min-width: 900px)";
export const STICKY_MAP_TOP = 24;
export const NARROW_SCROLL_MARGIN = 16;
/** On a phone, a map tap scrolls the map frame up to this far below the top of the screen. */
export const PINNED_FRAME_TOP = 12;
/** The old panel stops dimming after this long; the navigation itself is still on its way. */
export const INTENT_TIMEOUT_MS = 10_000;
/** An intent older than this is stale (its page never mounted a map, for example). */
export const INTENT_MAX_AGE_MS = 60_000;

/** A navigation the map has already started moving toward, read by the page that arrives. */
export interface PendingIntent {
  pathname: string;
  origin: IntentOrigin;
  /** The map frame's viewport top after the click (and after the scroll a phone map tap starts). */
  frameTop: number;
  /** The frame's document offset at the click. */
  frameDocTop: number;
  /** performance.now() at the click. */
  at: number;
}

/** The intent that brought the page at `pathname`, or null. */
export function matchIntent(intent: PendingIntent | null, pathname: string, now: number): PendingIntent | null {
  return intent && intent.pathname === pathname && now - intent.at < INTENT_MAX_AGE_MS ? intent : null;
}

export interface ArrivalInput {
  origin: IntentOrigin;
  /** Two-column layout with the sticky map. */
  wide: boolean;
  reducedMotion: boolean;
  scrollY: number;
  /** The intent's frameTop and frameDocTop. */
  frameTopThen: number;
  frameDocTopThen: number;
  /** The frame's viewport top now; null without a frame. */
  frameTopNow: number | null;
  /** The layout's viewport top now; null without a layout. */
  layoutTop: number | null;
  /** Where the scroll a phone map tap started is heading while it still runs; null once it is done. */
  pinTarget: number | null;
}

export interface ArrivalScroll {
  top: number;
  behavior: ScrollBehavior;
}

/**
 * Map and panel links opt out of Next's scroll-to-top, so the page scrolls here.
 * Returns the scrolls to apply in order (none when nothing needs to move):
 * - A map tap on a phone keeps the map where it is on screen. The change in
 *   layout above it (a shorter or taller head) is absorbed at once; scrolling
 *   the viewer did while the page loaded stays. If the tap's own scroll is
 *   still on its way up, it then carries on from there.
 * - On wide screens the sticky map stays put while the new heading scrolls into view.
 * - A panel link on a phone brings the new heading into view.
 */
export function arrivalScroll(input: ArrivalInput): ArrivalScroll[] {
  const { origin, wide, reducedMotion, scrollY, frameTopNow, layoutTop } = input;
  if (origin === "other") return [];
  if (origin === "map" && !wide) {
    if (frameTopNow === null) return [];
    const shift = scrollY + frameTopNow - input.frameDocTopThen;
    // No change above the map: a running pin scroll carries on by itself.
    if (Math.abs(shift) < 0.5) return [];
    // Absorb the layout change in this frame, so the frame stays where it is on screen.
    const steps: ArrivalScroll[] = [{ top: scrollY + shift, behavior: "instant" }];
    // Still scrolling the map up: finish that scroll from the compensated position.
    if (input.pinTarget !== null && Math.abs(input.pinTarget - scrollY) >= 1) {
      steps.push({ top: input.pinTarget + shift, behavior: "smooth" });
    }
    return steps;
  }
  if (layoutTop === null || layoutTop >= 0) return [];
  if (wide) {
    // A new panel too short for this scroll position has already pushed the sticky map up: put it back
    // before paint. Otherwise glide; the map stays pinned while the heading comes into view.
    const displaced = frameTopNow !== null && Math.abs(frameTopNow - input.frameTopThen) > 1;
    return [
      {
        top: scrollY + layoutTop - STICKY_MAP_TOP,
        behavior: reducedMotion ? "auto" : displaced ? "instant" : "smooth",
      },
    ];
  }
  return [{ top: scrollY + layoutTop - NARROW_SCROLL_MARGIN, behavior: "instant" }];
}
