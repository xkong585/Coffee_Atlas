import { angularDistance, type LngLatTuple } from "@/modules/map-experience/lib/geometry";

/**
 * Camera timing for moves between map focuses. Pure, so it can be unit tested.
 * Durations come from the distance and zoom change, not from a speed, so a
 * step to a sibling region and a flight across the globe each take a steady,
 * predictable time. Short moves ease without the zoom-out arc of a flight.
 */

export interface CameraTarget {
  center: LngLatTuple;
  zoom: number;
}

export type FlightPlan = { kind: "jump" } | { kind: "ease" | "fly"; duration: number };

/** Moves within this distance (degrees) and zoom change ease in place instead of flying. */
const EASE_MAX_DISTANCE = 12;
const EASE_MAX_ZOOM_CHANGE = 1.6;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export function flightPlan(from: CameraTarget, to: CameraTarget, reducedMotion: boolean): FlightPlan {
  if (reducedMotion) return { kind: "jump" };
  const distance = angularDistance(from.center, to.center);
  const zoomChange = Math.abs(to.zoom - from.zoom);
  if (!Number.isFinite(distance) || !Number.isFinite(zoomChange)) return { kind: "jump" };
  if (distance < 0.01 && zoomChange < 0.01) return { kind: "jump" };
  if (distance <= EASE_MAX_DISTANCE && zoomChange <= EASE_MAX_ZOOM_CHANGE) {
    return { kind: "ease", duration: Math.round(clamp(450 + 160 * zoomChange + 12 * distance, 550, 850)) };
  }
  return { kind: "fly", duration: Math.round(clamp(900 + 3.5 * distance + 90 * zoomChange, 1000, 1600)) };
}
