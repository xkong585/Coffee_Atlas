"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useId, useState } from "react";
import { ArrowIcon } from "@/components/icons";
import {
  type ApiResult,
  type Preferences,
  preferencesSchema,
  type RecommendationRequest,
  type RecommendationResponse,
  recommendationRequestSchema,
} from "@/contracts";
import { itemKey } from "@/modules/recommendations/lib/candidates";
import type { RecommendationLookup } from "@/modules/recommendations/lib/lookup";
import { AllowanceNote } from "@/modules/accounts/ui/allowance-note";
import { SaveAction } from "@/modules/accounts/ui/save-action";
import type { InitialSearch } from "./search-context";
import styles from "./recommendations.module.css";

const LEVELS = ["any", "low", "medium", "high"] as const;
const ROASTS = ["any", "light", "medium", "dark"] as const;
const MILK = [
  { value: "any", label: "Either way" },
  { value: "none", label: "Black" },
  { value: "dairy", label: "Dairy milk" },
  { value: "plant", label: "Plant milk" },
] as const;
const METHODS = [
  { value: "espresso", label: "Espresso" },
  { value: "filter", label: "Filter / pour-over" },
  { value: "immersion", label: "French press / immersion" },
  { value: "cold", label: "Cold" },
] as const;
const FLAVORS = ["chocolate", "nutty", "caramel", "fruity", "citrus", "berry", "floral", "spicy", "earthy", "creamy"];
const MAX_FLAVORS = 12;
const MAX_NOTES = 1000;

const EMPTY_PREFERENCES: Preferences = {
  acidity: "any", sweetness: "any", roast: "any", milk: "any", flavors: [], preparationMethods: [], notes: "",
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export type Outcome =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; data: RecommendationResponse }
  | { kind: "error"; message: string; retry: boolean; action?: { href: string; label: string } };

type SaveState = "idle" | "saving" | "saved" | "sign-in" | "unavailable" | "failed";

export async function readEnvelope<T>(response: Response): Promise<ApiResult<T> | null> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" && "ok" in body ? (body as ApiResult<T>) : null;
  } catch {
    return null;
  }
}

export function errorFor(status: number, envelope: ApiResult<unknown> | null): { message: string; retry: boolean; action?: { href: string; label: string } } {
  const server = envelope && !envelope.ok ? envelope.error : null;
  // The free quota (Member 3's paid benefit): sign in first, then unlock after the free ones.
  if (status === 401 && server) return { message: server.message, retry: false, action: { href: "/login?next=/recommendations", label: "Sign in" } };
  if (status === 403 && server) return { message: server.message, retry: false, action: { href: "/upgrade", label: "See the unlock" } };
  if (status === 400) return { message: server?.message ?? "Something in the search didn’t look right. Please check your choices.", retry: false };
  if (server) return { message: server.message, retry: server.retryable };
  return { message: "We couldn’t reach the recommendation service. Check your connection and try again.", retry: true };
}

/** Merges free-text flavors ("smoky, honey") into the checked chips without duplicates, up to the contract limit. */
function combinedFlavors(checked: string[], extra: string): string[] {
  const typed = extra.split(",").map((value) => value.trim().toLowerCase().slice(0, 60)).filter(Boolean);
  return [...new Set([...checked, ...typed])].slice(0, MAX_FLAVORS);
}

function RadioRow<T extends string>({ legend, name, value, options, onChange }: {
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
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const levelOptions = LEVELS.map((value) => ({ value, label: value === "any" ? "No preference" : capitalize(value) }));
const roastOptions = ROASTS.map((value) => ({ value, label: value === "any" ? "No preference" : capitalize(value) }));

export function RecommendationForm({ lookup, initial }: { lookup: RecommendationLookup; initial: InitialSearch }) {
  const formId = useId();
  const [preferences, setPreferences] = useState<Preferences>(EMPTY_PREFERENCES);
  const [extraFlavors, setExtraFlavors] = useState("");
  const [itemType, setItemType] = useState<RecommendationRequest["itemType"]>(initial.itemType ?? "both");
  const [scope, setScope] = useState<"global" | "selected" | null>(initial.countryId ? initial.scope : "global");
  const [startingItem, setStartingItem] = useState(initial.startingItem);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [formProblem, setFormProblem] = useState<string | null>(null);
  const [loadedSaved, setLoadedSaved] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Bumped after each answer so the free-quota line re-reads the account.
  const [searches, setSearches] = useState(0);

  const country = lookup.countries.find((entry) => entry.id === initial.countryId) ?? null;
  const region = country?.regions.find((entry) => entry.id === initial.regionId) ?? null;
  const placeName = region && country ? `${region.name}, ${country.name}` : country?.name ?? null;
  const start = startingItem ? lookup.items[itemKey(startingItem)] : undefined;

  // Prefill from the account when one is connected; any other answer leaves the empty form.
  useEffect(() => {
    let active = true;
    fetch("/api/preferences", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const envelope = await readEnvelope<Preferences | null>(response);
        if (!active || response.status !== 200 || !envelope?.ok || !envelope.data) return;
        const parsed = preferencesSchema.safeParse(envelope.data);
        if (!parsed.success) return;
        setPreferences(parsed.data);
        setLoadedSaved(true);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
    setSaveState("idle");
  };

  const toggle = (key: "flavors" | "preparationMethods", value: string) => {
    setPreferences((current) => {
      const list = current[key] as string[];
      const next = list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
      return { ...current, [key]: next };
    });
    setSaveState("idle");
  };

  function currentPreferences(): Preferences | null {
    const parsed = preferencesSchema.safeParse({ ...preferences, flavors: combinedFlavors(preferences.flavors, extraFlavors) });
    return parsed.success ? parsed.data : null;
  }

  async function search(overrides: Partial<Pick<RecommendationRequest, "itemType">> & { scope?: "global" } = {}) {
    const prefs = currentPreferences();
    const effectiveScope = overrides.scope ?? scope;
    if (!prefs) {
      setFormProblem("Some of your answers are too long. Shorten the flavors or notes and try again.");
      return;
    }
    if (!effectiveScope) {
      setFormProblem(`Choose whether to search only ${placeName ?? "this place"} or all supported locations.`);
      return;
    }
    const request = recommendationRequestSchema.safeParse({
      preferences: prefs,
      itemType: overrides.itemType ?? itemType,
      geography: {
        scope: effectiveScope,
        ...(country ? { countryId: country.id } : {}),
        ...(country && region ? { regionId: region.id } : {}),
      },
      ...(startingItem ? { startingItem } : {}),
      limit: 3,
    });
    if (!request.success) {
      setFormProblem("Something in the search didn’t look right. Please check your choices.");
      return;
    }
    if (overrides.itemType) setItemType(overrides.itemType);
    if (overrides.scope) setScope(overrides.scope);
    setFormProblem(null);
    setOutcome({ kind: "loading" });
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.data),
        cache: "no-store",
        credentials: "same-origin",
      });
      const envelope = await readEnvelope<RecommendationResponse>(response);
      if (response.status === 200 && envelope?.ok) setOutcome({ kind: "result", data: envelope.data });
      else setOutcome({ kind: "error", ...errorFor(response.status, envelope) });
    } catch {
      setOutcome({ kind: "error", ...errorFor(0, null) });
    }
    setSearches((count) => count + 1);
  }

  async function savePreferences() {
    const prefs = currentPreferences();
    if (!prefs) return;
    setSaveState("saving");
    try {
      const response = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
        cache: "no-store",
        credentials: "same-origin",
      });
      const envelope = await readEnvelope<Preferences>(response);
      if (response.status === 200 && envelope?.ok) setSaveState("saved");
      else if (response.status === 401) setSaveState("sign-in");
      else if (response.status === 503) setSaveState("unavailable");
      else setSaveState("failed");
    } catch {
      setSaveState("failed");
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search();
  }

  const flavorCount = combinedFlavors(preferences.flavors, extraFlavors).length;

  return (
    <div className={styles.layout}>
      <form className={styles.form} onSubmit={onSubmit} aria-describedby={formProblem ? `${formId}-problem` : undefined} noValidate>
        {loadedSaved ? <p className="small-note">We filled this in from your saved preferences.</p> : null}

        <section className={styles.group} aria-labelledby={`${formId}-search`}>
          <h2 id={`${formId}-search`}>What to look for</h2>
          <RadioRow
            legend="Show me"
            name="itemType"
            value={itemType}
            onChange={setItemType}
            options={[
              { value: "both", label: "Beans and drinks" },
              { value: "bean", label: "Coffee beans" },
              { value: "drink", label: "Regional drinks" },
            ]}
          />
          {country ? (
            <fieldset className={styles.field}>
              <legend>Where should we look?</legend>
              <div className={styles.chips}>
                <label className={styles.chip}>
                  <input type="radio" name="scope" checked={scope === "selected"} onChange={() => setScope("selected")} />
                  <span>Only {placeName}</span>
                </label>
                <label className={styles.chip}>
                  <input type="radio" name="scope" checked={scope === "global"} onChange={() => setScope("global")} />
                  <span>All supported locations</span>
                </label>
              </div>
            </fieldset>
          ) : (
            <p className="small-note">Searching all supported locations. Start from a country on the map to search one place.</p>
          )}
          {start ? (
            <p className={styles.starting}>
              Starting from <Link href={start.href}>{start.name}</Link>.{" "}
              <button type="button" className={styles.linkButton} onClick={() => setStartingItem(null)}>Don’t use it</button>
            </p>
          ) : null}
        </section>

        <section className={styles.group} aria-labelledby={`${formId}-taste`}>
          <h2 id={`${formId}-taste`}>Your taste</h2>
          <RadioRow legend="Acidity (brightness)" name="acidity" value={preferences.acidity} options={levelOptions} onChange={(value) => update("acidity", value)} />
          <RadioRow legend="Sweetness" name="sweetness" value={preferences.sweetness} options={levelOptions} onChange={(value) => update("sweetness", value)} />
          <RadioRow legend="Roast" name="roast" value={preferences.roast} options={roastOptions} onChange={(value) => update("roast", value)} />
          <RadioRow legend="Milk" name="milk" value={preferences.milk} options={MILK} onChange={(value) => update("milk", value)} />

          <fieldset className={styles.field}>
            <legend>Flavors you enjoy</legend>
            <div className={styles.chips}>
              {[...new Set([...FLAVORS, ...preferences.flavors])].map((flavor) => (
                <label key={flavor} className={styles.chip}>
                  <input type="checkbox" checked={preferences.flavors.includes(flavor)} onChange={() => toggle("flavors", flavor)} />
                  <span>{capitalize(flavor)}</span>
                </label>
              ))}
            </div>
            <label className={styles.textLabel}>
              Other flavors, separated by commas
              <input type="text" value={extraFlavors} maxLength={300} onChange={(event) => setExtraFlavors(event.target.value)} placeholder="e.g. honey, smoky" />
            </label>
            {flavorCount >= MAX_FLAVORS ? <p className="small-note">We’ll use your first {MAX_FLAVORS} flavors.</p> : null}
          </fieldset>

          <fieldset className={styles.field}>
            <legend>How you make or order coffee</legend>
            <div className={styles.chips}>
              {METHODS.map((method) => (
                <label key={method.value} className={styles.chip}>
                  <input
                    type="checkbox"
                    checked={preferences.preparationMethods.includes(method.value)}
                    onChange={() => toggle("preparationMethods", method.value)}
                  />
                  <span>{method.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className={styles.textLabel}>
            Anything else, in your own words
            <textarea
              rows={4}
              maxLength={MAX_NOTES}
              value={preferences.notes}
              onChange={(event) => update("notes", event.target.value)}
              placeholder="e.g. I usually drink milk coffee, like it a little sweet, and want to try a different regional style."
            />
            <span className={styles.counter}>{preferences.notes.length}/{MAX_NOTES}</span>
          </label>
        </section>

        {formProblem ? <p id={`${formId}-problem`} className={styles.problem} role="alert">{formProblem}</p> : null}
        <div className="button-row">
          <button type="submit" className="button button-primary" disabled={outcome.kind === "loading"}>
            {outcome.kind === "loading" ? "Finding your coffee…" : "Find my coffee"}
            <ArrowIcon />
          </button>
          <button type="button" className={styles.linkButton} onClick={savePreferences} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Saving preferences…" : "Save these preferences"}
          </button>
        </div>
        <p className={styles.saveStatus} role="status">
          {saveState === "saved" ? "Saved to your account." : null}
          {saveState === "sign-in" ? <>Sign in to save your preferences. <Link href="/login?next=/recommendations">Sign in</Link></> : null}
          {saveState === "unavailable" ? "Saving preferences isn’t available yet." : null}
          {saveState === "failed" ? "We couldn’t save your preferences. Please try again." : null}
        </p>
        <AllowanceNote refreshKey={searches} className={styles.saveStatus} />
      </form>

      <section className={styles.results} aria-labelledby={`${formId}-results`} aria-live="polite" aria-busy={outcome.kind === "loading"}>
        <h2 id={`${formId}-results`}>Recommendations</h2>
        <Results
          outcome={outcome}
          lookup={lookup}
          canWiden={scope === "selected"}
          canBroaden={itemType !== "both"}
          onRetry={() => void search()}
          onWiden={() => void search({ scope: "global" })}
          onBroaden={() => void search({ itemType: "both" })}
        />
      </section>
    </div>
  );
}

export function Results({ outcome, lookup, canWiden, canBroaden, onRetry, onWiden, onBroaden }: {
  outcome: Outcome;
  lookup: RecommendationLookup;
  canWiden: boolean;
  canBroaden: boolean;
  onRetry: () => void;
  onWiden: () => void;
  onBroaden: () => void;
}) {
  if (outcome.kind === "idle") {
    return <p className="small-note">Choose a few preferences and select “Find my coffee”. Results appear here.</p>;
  }
  if (outcome.kind === "loading") {
    return <p className="small-note">Matching your taste against the atlas. This can take a few seconds.</p>;
  }
  if (outcome.kind === "error") {
    return (
      <div className={styles.message} data-kind="error">
        <p>{outcome.message}</p>
        {outcome.retry ? <button type="button" className={styles.linkButton} onClick={onRetry}>Try again</button> : null}
        {outcome.action ? <Link className={styles.linkButton} href={outcome.action.href}>{outcome.action.label}</Link> : null}
      </div>
    );
  }
  const { data } = outcome;
  if (data.status === "no-match") {
    return (
      <div className={styles.message} data-kind="no-match">
        <p>{data.reason}</p>
        {data.suggestions.length > 0 ? <ul>{data.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul> : null}
        <div className={styles.actions}>
          {canWiden ? <button type="button" className={styles.linkButton} onClick={onWiden}>Search all locations</button> : null}
          {canBroaden ? <button type="button" className={styles.linkButton} onClick={onBroaden}>Show beans and drinks</button> : null}
        </div>
      </div>
    );
  }
  return (
    <ol className={styles.matches}>
      {data.matches.map((match) => {
        const entry = lookup.items[itemKey(match.item)];
        const name = entry?.name ?? match.item.itemId;
        return (
          <li key={itemKey(match.item)} className={styles.match}>
            <p className="eyebrow">{match.item.itemType === "bean" ? "Coffee bean" : "Regional drink"}{entry?.place ? ` · ${entry.place}` : ""}</p>
            <h3>{entry ? <Link href={entry.href}>{name}</Link> : name}</h3>
            <p className={styles.subhead}>Why it may suit you</p>
            <ul>{match.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            {match.tradeOffs.length > 0 ? (
              <>
                <p className={styles.subhead}>Worth knowing</p>
                <ul>{match.tradeOffs.map((tradeOff) => <li key={tradeOff}>{tradeOff}</li>)}</ul>
              </>
            ) : null}
            <p className={styles.sources}>
              <span>Sources</span>
              {match.sourceIds.map((id) => {
                const source = lookup.sources[id];
                return source
                  ? (
                    <a key={id} href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                      {/* Different publishers can share a title ("Origins: Ethiopia"). */}
                      {source.publisher ? ` (${source.publisher})` : null}
                      <span className={styles.srOnly}> (opens in a new tab)</span>
                    </a>
                  )
                  : <span key={id}>Source record unavailable</span>;
              })}
            </p>
            <div className={styles.matchActions}>
              {entry ? <Link className="text-link" href={entry.href}>Read more<ArrowIcon /></Link> : null}
              <SaveAction itemType={match.item.itemType} itemId={match.item.itemId} itemName={name} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
