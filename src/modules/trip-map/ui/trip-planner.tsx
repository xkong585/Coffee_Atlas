"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useId, useReducer, useState } from "react";
import { ArrowIcon } from "@/components/icons";
import {
  type ApiResult,
  type Preferences,
  preferencesSchema,
  TRIP_MAX_STOPS,
  TRIP_MIN_STOPS,
  type TripItinerary,
  type TripResponse,
} from "@/contracts";
import { SaveAction } from "@/modules/accounts/ui/save-action";
import { itemKey, placeKey } from "@/modules/trip-map/lib/destinations";
import { initialTripForm, tripFormReducer, tripRequestFromForm } from "@/modules/trip-map/lib/form-state";
import type { TripLookup } from "@/modules/trip-map/lib/lookup";
import { type GlobeStop, TripGlobe } from "./trip-globe";
import styles from "./trip.module.css";

const FLAVORS = ["chocolate", "nutty", "caramel", "fruity", "citrus", "berry", "floral", "spicy", "earthy", "creamy"];
const MILK = [
  { value: "any", label: "Either way" },
  { value: "none", label: "Black" },
  { value: "dairy", label: "Dairy milk" },
  { value: "plant", label: "Plant milk" },
] as const;
const ROASTS = [
  { value: "any", label: "No preference" },
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "dark", label: "Dark" },
] as const;
const STOP_COUNTS = Array.from({ length: TRIP_MAX_STOPS - TRIP_MIN_STOPS + 1 }, (_, index) => TRIP_MIN_STOPS + index);
const MAX_NOTES = 1000;

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

type Outcome =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; data: TripResponse; id: number }
  | { kind: "error"; message: string; retry: boolean; upgrade: boolean };

async function readEnvelope<T>(response: Response): Promise<ApiResult<T> | null> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" && "ok" in body ? (body as ApiResult<T>) : null;
  } catch {
    return null;
  }
}

function errorFor(status: number, envelope: ApiResult<unknown> | null): Extract<Outcome, { kind: "error" }> {
  const server = envelope && !envelope.ok ? envelope.error : null;
  if (status === 403) {
    return { kind: "error", message: server?.message ?? "The trip map is part of the paid plan.", retry: false, upgrade: true };
  }
  if (status === 400) {
    return { kind: "error", message: server?.message ?? "Something in the request didn’t look right. Please check your choices.", retry: false, upgrade: false };
  }
  if (server) return { kind: "error", message: server.message, retry: server.retryable, upgrade: false };
  return { kind: "error", message: "We couldn’t reach the trip planner. Check your connection and try again.", retry: true, upgrade: false };
}

function Chips<T extends string>({ legend, name, value, options, onChange }: {
  legend: string;
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className={styles.field}>
      <legend>{legend}</legend>
      <div className={styles.chips}>
        {options.map((option) => (
          <label key={option.value} className={styles.chip}>
            <input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function TripPlanner({ lookup }: { lookup: TripLookup }) {
  const formId = useId();
  const [form, dispatch] = useReducer(tripFormReducer, initialTripForm);
  const { preferences, stopCount, useSavedItems: useSaved, loadedSaved } = form;
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [problem, setProblem] = useState<string | null>(null);

  // Prefill from the account when one is connected; any other answer leaves the form empty.
  useEffect(() => {
    let active = true;
    fetch("/api/preferences", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const envelope = await readEnvelope<Preferences | null>(response);
        if (!active || response.status !== 200 || !envelope?.ok || !envelope.data) return;
        const parsed = preferencesSchema.safeParse(envelope.data);
        if (!parsed.success) return;
        dispatch({ type: "prefill", preferences: parsed.data });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    dispatch({ type: "preferences", patch: { [key]: value } });

  const toggleFlavor = (flavor: string) =>
    dispatch({ type: "flavor", flavor });

  async function plan() {
    if (outcome.kind === "loading") return;
    dispatch({ type: "submit" });
    const request = tripRequestFromForm(form);
    if (!request.success) {
      setProblem("Some of your answers are too long. Shorten the notes and try again.");
      return;
    }
    setProblem(null);
    setOutcome({ kind: "loading" });
    try {
      const response = await fetch("/api/trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.data),
        cache: "no-store",
        credentials: "same-origin",
      });
      const envelope = await readEnvelope<TripResponse>(response);
      if (response.status === 200 && envelope?.ok) setOutcome({ kind: "result", data: envelope.data, id: Date.now() });
      else setOutcome(errorFor(response.status, envelope));
    } catch {
      setOutcome(errorFor(0, null));
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void plan();
  }

  const loading = outcome.kind === "loading";

  return (
    <>
      <form className={styles.form} onSubmit={onSubmit} noValidate aria-describedby={problem ? `${formId}-problem` : undefined}>
        {loadedSaved ? <p className="small-note">We filled this in from your saved preferences.</p> : null}
        <div className={styles.formGrid}>
          <div>
            <fieldset className={styles.field}>
              <legend>Flavors you enjoy</legend>
              <div className={styles.chips}>
                {[...new Set([...FLAVORS, ...preferences.flavors])].map((flavor) => (
                  <label key={flavor} className={styles.chip}>
                    <input type="checkbox" checked={preferences.flavors.includes(flavor)} onChange={() => toggleFlavor(flavor)} />
                    <span>{capitalize(flavor)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Chips legend="Milk" name="milk" value={preferences.milk} options={MILK} onChange={(value) => update("milk", value)} />
            <Chips legend="Roast" name="roast" value={preferences.roast} options={ROASTS} onChange={(value) => update("roast", value)} />
          </div>
          <div>
            <label className={styles.textLabel}>
              Your coffee, and the trip you’d like, in your own words
              <textarea
                rows={4}
                maxLength={MAX_NOTES}
                value={preferences.notes}
                onChange={(event) => update("notes", event.target.value)}
                placeholder="e.g. I love sweet milk coffee and want to see where my favorite beans grow."
              />
              <span className={styles.counter}>{preferences.notes.length}/{MAX_NOTES}</span>
            </label>
            <fieldset className={styles.field}>
              <legend>Number of stops</legend>
              <div className={styles.chips}>
                {STOP_COUNTS.map((count) => (
                  <label key={count} className={styles.chip}>
                    <input type="radio" name="stops" checked={stopCount === count} onChange={() => dispatch({ type: "stops", count })} />
                    <span>{count}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={useSaved} onChange={(event) => dispatch({ type: "saved-items", enabled: event.target.checked })} />
              <span>Plan around the beans and drinks I saved (when signed in)</span>
            </label>
          </div>
        </div>
        {problem ? <p id={`${formId}-problem`} className={styles.problem} role="alert">{problem}</p> : null}
        <div className="button-row">
          <button type="submit" className="button button-primary" disabled={loading}>
            {loading ? "Planning your route…" : outcome.kind === "result" ? "Plan another trip" : "Plan my coffee trip"}
            <ArrowIcon />
          </button>
        </div>
      </form>

      <section className={styles.result} aria-live="polite" aria-busy={loading} aria-label="Your trip">
        <Result outcome={outcome} lookup={lookup} onRetry={() => void plan()} />
      </section>
    </>
  );
}

function Result({ outcome, lookup, onRetry }: { outcome: Outcome; lookup: TripLookup; onRetry: () => void }) {
  if (outcome.kind === "idle") {
    return <p className="small-note">Choose a few preferences and select “Plan my coffee trip”. Your route appears here, on the globe.</p>;
  }
  if (outcome.kind === "loading") {
    return <p className="small-note">Choosing destinations from the atlas and checking every stop. This can take a few seconds.</p>;
  }
  if (outcome.kind === "error") {
    return (
      <div className={styles.message} data-kind="error">
        <p>{outcome.message}</p>
        <div className={styles.actions}>
          {outcome.retry ? <button type="button" className={styles.linkButton} onClick={onRetry}>Try again</button> : null}
          {outcome.upgrade ? <Link className={styles.linkButton} href="/upgrade">See plans</Link> : null}
        </div>
      </div>
    );
  }
  if (outcome.data.status === "no-trip") {
    return (
      <div className={styles.message} data-kind="no-trip">
        <p>{outcome.data.reason}</p>
        {outcome.data.suggestions.length > 0 ? <ul>{outcome.data.suggestions.map((entry) => <li key={entry}>{entry}</li>)}</ul> : null}
        <div className={styles.actions}>
          <Link className={styles.linkButton} href="/explore">Explore the atlas</Link>
          <Link className={styles.linkButton} href="/login">Sign in</Link>
        </div>
      </div>
    );
  }
  return <Itinerary key={outcome.id} itinerary={outcome.data.itinerary} lookup={lookup} />;
}

function basisNote(basis: TripItinerary["basis"]): string {
  const taste = basis.preferences === "request" ? "the taste you described" : basis.preferences === "account" ? "your saved preferences" : null;
  const saved = basis.savedItems > 0 ? `${basis.savedItems} saved ${basis.savedItems === 1 ? "item" : "items"}` : null;
  return `Planned from ${[taste, saved].filter(Boolean).join(" and ") || "the atlas"}. Every stop and recommendation comes from the atlas catalog.`;
}

function Itinerary({ itinerary, lookup }: { itinerary: TripItinerary; lookup: TripLookup }) {
  const [active, setActive] = useState<number | null>(null);
  const globeStops: GlobeStop[] = itinerary.stops.map((stop) => {
    const place = lookup.places[placeKey(stop.countryId, stop.regionId)];
    return {
      order: stop.order,
      name: place?.name ?? stop.countryId,
      lngLat: place?.center ? [place.center.longitude, place.center.latitude] : null,
      iso: place?.iso ?? null,
    };
  });

  const select = (order: number) => {
    setActive(order);
    document.getElementById(`trip-stop-${order}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  return (
    <>
      <header className={styles.tripHeader}>
        <p className="eyebrow">Your coffee trip · {itinerary.stops.length} stops</p>
        <h2>{itinerary.title}</h2>
        <p className={styles.lede}>{itinerary.summary}</p>
        <p className="small-note">{basisNote(itinerary.basis)}</p>
      </header>
      <div className={styles.tripLayout}>
        <div className={styles.globeColumn}>
          <TripGlobe stops={globeStops} activeOrder={active} onSelect={select} label={`Map of the trip: ${itinerary.title}`} />
        </div>
        <ol className={styles.stops}>
          {itinerary.stops.map((stop) => {
            const place = lookup.places[placeKey(stop.countryId, stop.regionId)];
            const item = lookup.items[itemKey(stop.recommendation)];
            const itemName = item?.name ?? stop.recommendation.itemId;
            return (
              <li
                key={stop.order}
                id={`trip-stop-${stop.order}`}
                className={styles.stop}
                data-active={active === stop.order ? "" : undefined}
                onMouseEnter={() => setActive(stop.order)}
                onFocus={() => setActive(stop.order)}
              >
                <span className={styles.stopNumber} aria-hidden="true">{stop.order}</span>
                <div className={styles.stopBody}>
                  <p className="eyebrow">
                    Stop {stop.order}
                    {place && place.name !== place.countryName ? ` · ${place.countryName}` : ""}
                    {place?.approximate ? " · pin shows the country" : ""}
                  </p>
                  <h3>{place ? <Link href={place.href}>{place.name}</Link> : stop.countryId}</h3>
                  <p className={styles.tryLine}>
                    Try: {item ? <Link href={item.href}>{itemName}</Link> : itemName}
                    <span className={styles.kind}> · {item?.kind ?? stop.recommendation.itemType}</span>
                    {stop.fromSaved ? <span className={styles.savedTag}>From your saved list</span> : null}
                  </p>
                  <ul>{stop.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                  <p className={styles.sources}>
                    <span>Sources</span>
                    {stop.sourceIds.map((id) => {
                      const source = lookup.sources[id];
                      return source ? (
                        <a key={id} href={source.url} target="_blank" rel="noopener noreferrer">
                          {source.title}{source.publisher ? ` (${source.publisher})` : null}
                          <span className={styles.srOnly}> (opens in a new tab)</span>
                        </a>
                      ) : <span key={id}>Source record unavailable</span>;
                    })}
                  </p>
                  <div className={styles.stopActions}>
                    {place ? <Link className="text-link" href={place.href}>Explore {place.name}<ArrowIcon /></Link> : null}
                    <SaveAction itemType={stop.recommendation.itemType} itemId={stop.recommendation.itemId} itemName={itemName} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}
