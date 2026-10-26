import type { useRouter } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";
import type { LngLatTuple } from "@/modules/map-experience/lib/geometry";

/** Types shared by <ExploreMap> and the map modules it lends itself to. */

/** Next's app router, typed through the public `useRouter`. */
export type Router = ReturnType<typeof useRouter>;

export type MapStatus = "loading" | "ready" | "error";

/** Where a navigation started: a map marker or outline, a link in the panel, or any other /explore link. */
export type IntentOrigin = "map" | "panel" | "other";

export interface TooltipState {
  key: string;
  title: string;
  detail: string;
  x: number;
  y: number;
  below: boolean;
}

/** Where the tooltip is attached, so it can follow its marker while the camera moves. */
export type TooltipAnchor = { kind: "marker"; key: string; lngLat: LngLatTuple } | { kind: "pointer"; key: string };

/**
 * What the mounted <ExploreMap> lends the live map. Null while the map is
 * parked; the map's listeners read it at event time and do nothing without it.
 */
export interface MapBindings {
  /** The React-owned element the host sits in. */
  slot: HTMLDivElement;
  getRouter(): Router;
  setTooltip: Dispatch<SetStateAction<TooltipState | null>>;
  hideTooltip(key?: string): void;
  setStatus(status: MapStatus): void;
  anchorRef: { current: TooltipAnchor | null };
  startIntent(href: string, origin: IntentOrigin): void;
}
