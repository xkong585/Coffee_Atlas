"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { LngLatTuple } from "@/modules/map-experience/lib/geometry";
import { loadCountries, loadMapLibre, prefersReducedMotion, webglSupported } from "@/modules/map-experience/ui/map/load";
import { buildMapStyle } from "@/modules/map-experience/ui/map/style";
import { partialLine, routeLine, tripCamera } from "@/modules/trip-map/lib/route";
import styles from "./trip.module.css";

/**
 * The trip drawn on the atlas globe: the same Natural Earth outlines and
 * MapLibre style as the explore map (map-experience/ui/map/style.ts), with the
 * stop countries tinted, a great-circle route between consecutive stops and a
 * numbered pin per stop. It is an enhancement: every stop is also in the list
 * beside it, and a stop without coordinates stays list-only.
 *
 * Its own MapLibre instance rather than the explore page's kept-alive map:
 * that map is bound to /explore navigation (markers push explore routes).
 */

export interface GlobeStop {
  order: number;
  name: string;
  /** Null: no pin (the stop is still listed). */
  lngLat: LngLatTuple | null;
  iso: string | null;
}

const ROUTE_SOURCE = "trip-route";
const DRAW_MS = 1600;
const READY_FALLBACK_MS = 2500;
/** Route color: the site accent (--accent in globals.css); WebGL paint can't read CSS variables. */
const ROUTE_COLOR = "#865039";

type Status = "loading" | "ready" | "error";

const lineData = (coordinates: LngLatTuple[]) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates },
});

export function TripGlobe({ stops, activeOrder, onSelect, label }: {
  stops: GlobeStop[];
  activeOrder: number | null;
  onSelect: (order: number) => void;
  label: string;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<number, Marker>());
  const onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Build once per itinerary: the parent remounts this component (key) for a new plan.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stops are fixed for this mount.
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    let cancelled = false;
    let frame = 0;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    const markers = markersRef.current;
    const mapped = stops.filter((stop): stop is GlobeStop & { lngLat: LngLatTuple } => stop.lngLat !== null);
    const points = mapped.map((stop) => stop.lngLat);
    const line = routeLine(points);

    const start = async () => {
      if (!webglSupported()) throw new Error("WebGL is not available in this browser.");
      const [lib, outlines] = await Promise.all([loadMapLibre(), loadCountries()]);
      if (cancelled) return;
      const reduced = prefersReducedMotion();
      const isoCodes = [...new Set(stops.map((stop) => stop.iso).filter((iso): iso is string => Boolean(iso)))];
      const camera = tripCamera(points, slot.clientWidth, slot.clientHeight);
      const map = new lib.Map({
        container: slot,
        style: buildMapStyle(outlines, isoCodes, null, null, { reducedMotion: reduced }),
        center: camera.center,
        zoom: camera.zoom,
        minZoom: 0.2,
        maxZoom: 7,
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        rollEnabled: false,
        cooperativeGestures: true,
        fadeDuration: 0,
        canvasContextAttributes: { antialias: window.devicePixelRatio < 2 },
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        attributionControl: false,
        locale: { "Map.Title": "Trip map. Use arrow keys to pan and plus or minus to zoom." },
      });
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");

      let loaded = false;
      map.on("error", (event) => {
        if (!loaded) fail(event.error);
        else console.warn("[trip-globe]", event.error);
      });
      map.on("webglcontextlost", () => setStatus("error"));

      map.once("load", () => {
        loaded = true;
        if (cancelled) return;
        map.addSource(ROUTE_SOURCE, { type: "geojson", data: lineData(reduced ? line : partialLine(line, 0)) });
        map.addLayer({
          id: "trip-route-casing",
          type: "line",
          source: ROUTE_SOURCE,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#fbfbf8", "line-width": 5.5, "line-opacity": 0.85 },
        });
        map.addLayer({
          id: "trip-route",
          type: "line",
          source: ROUTE_SOURCE,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": ROUTE_COLOR, "line-width": 2.4 },
        });

        for (const stop of mapped) {
          const element = document.createElement("button");
          element.type = "button";
          element.className = styles.pin;
          element.textContent = String(stop.order);
          element.setAttribute("aria-label", `Stop ${stop.order}: ${stop.name}`);
          element.dataset.order = String(stop.order);
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            onSelectRef.current(stop.order);
          });
          markers.set(stop.order, new lib.Marker({ element, anchor: "center" }).setLngLat(stop.lngLat).addTo(map));
        }

        if (!reduced && line.length >= 2) {
          const began = performance.now();
          const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
          const draw = (now: number) => {
            if (cancelled) return;
            const fraction = Math.min(1, (now - began) / DRAW_MS);
            // Ease out, so the last leg settles gently.
            source?.setData(lineData(partialLine(line, 1 - (1 - fraction) ** 2)));
            if (fraction < 1) frame = requestAnimationFrame(draw);
          };
          frame = requestAnimationFrame(draw);
        }

        const markReady = () => {
          clearTimeout(readyTimer);
          if (!cancelled) setStatus("ready");
        };
        map.once("idle", markReady);
        readyTimer = setTimeout(markReady, READY_FALLBACK_MS);
      });
    };

    const fail = (error: unknown) => {
      if (cancelled) return;
      console.warn("[trip-globe] The map could not load; the stop list remains available.", error);
      setStatus("error");
    };

    start().catch(fail);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(readyTimer);
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Highlight the active stop's pin and bring it into view.
  useEffect(() => {
    for (const [order, marker] of markersRef.current) {
      const element = marker.getElement();
      if (order === activeOrder) element.setAttribute("data-active", "");
      else element.removeAttribute("data-active");
    }
    const map = mapRef.current;
    const marker = activeOrder === null ? undefined : markersRef.current.get(activeOrder);
    if (map && marker && status === "ready") {
      map.easeTo({ center: marker.getLngLat(), duration: prefersReducedMotion() ? 0 : 700 });
    }
  }, [activeOrder, status]);

  const unmapped = stops.filter((stop) => stop.lngLat === null);

  return (
    <section aria-label={label} className={styles.globe} data-state={status}>
      <div className={styles.globeFrame}>
        <div ref={slotRef} className={styles.globeCanvas} />
        <div className={styles.globeSkeleton} aria-hidden="true">
          <div className={styles.globeSkeletonDisc} />
          <span>Drawing your route</span>
        </div>
        <p role="status" className={status === "error" ? styles.globeError : styles.srOnly}>
          {status === "error" ? "The map couldn’t load. Every stop is listed beside it." : ""}
        </p>
      </div>
      {status !== "error" ? (
        <p className={styles.globeCaption}>
          <span><span className={styles.legendLine} aria-hidden="true" />Your route, in order</span>
          {unmapped.length > 0 ? (
            <span>
              Not on the map (no coordinates yet): {unmapped.map((stop) => `${stop.order}. ${stop.name}`).join(", ")}
            </span>
          ) : null}
          <span className={styles.credits}>
            Outlines{" "}
            <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a>
            {" "}· Map{" "}
            <a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">MapLibre</a>
          </span>
        </p>
      ) : null}
    </section>
  );
}
