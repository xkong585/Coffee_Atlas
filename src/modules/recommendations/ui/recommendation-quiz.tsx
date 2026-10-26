"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ArrowIcon } from "@/components/icons";
import {
  type Preferences,
  preferencesSchema,
  type RecommendationRequest,
  type RecommendationResponse,
  recommendationRequestSchema,
  type SessionState,
} from "@/contracts";
import { AllowanceNote } from "@/modules/accounts/ui/allowance-note";
import type { RecommendationLookup } from "@/modules/recommendations/lib/lookup";
import { errorFor, type Outcome, Results, readEnvelope } from "./recommendation-form";
import type { InitialSearch } from "./search-context";
import styles from "./quiz.module.css";

type ItemType = RecommendationRequest["itemType"];
type Method = Preferences["preparationMethods"][number];

interface Answers {
  itemType: ItemType;
  scope: "global" | "selected";
  acidity: Preferences["acidity"];
  sweetness: Preferences["sweetness"];
  roast: Preferences["roast"];
  milk: Preferences["milk"];
  duels: (string | null)[];
  methods: Method[];
  notes: string;
}

interface Choice {
  value: string;
  label: string;
  swatch?: string;
  level?: number;
}

type Step =
  | { kind: "pick"; id: string; title: string; choices: Choice[]; apply: (answers: Answers, value: string | null) => Answers }
  | { kind: "methods"; id: string; title: string }
  | { kind: "notes"; id: string; title: string };

type Phase = "checking" | "gate" | "welcome" | "quiz" | "results";

/** Four head-to-head rounds; each winner joins the flavor list sent with the request. */
const DUELS: [Choice, Choice][] = [
  [{ value: "chocolate", label: "Chocolate", swatch: "#5a3825" }, { value: "fruity", label: "Fruity", swatch: "#c2553f" }],
  [{ value: "nutty", label: "Nutty", swatch: "#a77a4f" }, { value: "floral", label: "Floral", swatch: "#c79bb8" }],
  [{ value: "caramel", label: "Caramel", swatch: "#c98a3c" }, { value: "citrus", label: "Citrus", swatch: "#e2b33c" }],
  [{ value: "earthy", label: "Earthy", swatch: "#6b6a4a" }, { value: "berry", label: "Berry", swatch: "#7d2f4f" }],
];

const METHODS: { value: Method; label: string }[] = [
  { value: "espresso", label: "Espresso" },
  { value: "filter", label: "Pour-over" },
  { value: "immersion", label: "French press" },
  { value: "cold", label: "Cold" },
];

const LEVELS: Choice[] = [
  { value: "low", label: "Low", level: 1 },
  { value: "medium", label: "Medium", level: 2 },
  { value: "high", label: "High", level: 3 },
];

const EMPTY: Answers = {
  itemType: "both", scope: "global", acidity: "any", sweetness: "any", roast: "any", milk: "any",
  duels: DUELS.map(() => null), methods: [], notes: "",
};

const PENDING_KEY = "coffee-atlas:pending-quiz";
const LEAVE_MS = 560;

function buildSteps(placeName: string | null): Step[] {
  const steps: Step[] = [
    {
      kind: "pick", id: "itemType", title: "What are you after?",
      choices: [
        { value: "both", label: "Beans & drinks", swatch: "#865039" },
        { value: "bean", label: "Coffee beans", swatch: "#4a3426" },
        { value: "drink", label: "Regional drinks", swatch: "#d9b8a4" },
      ],
      apply: (a, v) => ({ ...a, itemType: (v ?? "both") as ItemType }),
    },
  ];
  if (placeName) {
    steps.push({
      kind: "pick", id: "scope", title: "Where should we look?",
      choices: [{ value: "selected", label: `Only ${placeName}` }, { value: "global", label: "Anywhere" }],
      apply: (a, v) => ({ ...a, scope: v === "selected" ? "selected" : "global" }),
    });
  }
  steps.push(
    { kind: "pick", id: "acidity", title: "Pick your acidity", choices: LEVELS, apply: (a, v) => ({ ...a, acidity: (v ?? "any") as Answers["acidity"] }) },
    { kind: "pick", id: "sweetness", title: "Pick your sweetness", choices: LEVELS, apply: (a, v) => ({ ...a, sweetness: (v ?? "any") as Answers["sweetness"] }) },
    {
      kind: "pick", id: "roast", title: "Pick your roast",
      choices: [
        { value: "light", label: "Light", swatch: "#c8a27a" },
        { value: "medium", label: "Medium", swatch: "#8b5a3c" },
        { value: "dark", label: "Dark", swatch: "#33241c" },
      ],
      apply: (a, v) => ({ ...a, roast: (v ?? "any") as Answers["roast"] }),
    },
    {
      kind: "pick", id: "milk", title: "How do you take it?",
      choices: [
        { value: "none", label: "Black", swatch: "#2b211c" },
        { value: "dairy", label: "Dairy milk", swatch: "#f3ede2" },
        { value: "plant", label: "Plant milk", swatch: "#e2d8bf" },
      ],
      apply: (a, v) => ({ ...a, milk: (v ?? "any") as Answers["milk"] }),
    },
    ...DUELS.map((pair, round): Step => ({
      kind: "pick", id: `duel-${round}`, title: "Pick your favorite", choices: pair,
      apply: (a, v) => ({ ...a, duels: a.duels.map((entry, index) => (index === round ? v : entry)) }),
    })),
    { kind: "methods", id: "methods", title: "How do you brew?" },
    { kind: "notes", id: "notes", title: "Anything else?" },
  );
  return steps;
}

function toPreferences(answers: Answers): Preferences {
  return {
    acidity: answers.acidity,
    sweetness: answers.sweetness,
    roast: answers.roast,
    milk: answers.milk,
    flavors: answers.duels.filter((flavor): flavor is string => Boolean(flavor)),
    preparationMethods: answers.methods,
    notes: answers.notes.trim(),
  };
}

function tasteLine(preferences: Preferences): string {
  const parts: string[] = [];
  if (preferences.acidity !== "any") parts.push(`${preferences.acidity} acidity`);
  if (preferences.sweetness !== "any") parts.push(`${preferences.sweetness} sweetness`);
  if (preferences.roast !== "any") parts.push(`${preferences.roast} roast`);
  if (preferences.milk === "none") parts.push("black");
  if (preferences.milk === "dairy" || preferences.milk === "plant") parts.push(`${preferences.milk} milk`);
  parts.push(...preferences.flavors.slice(0, 3));
  const line = parts.join(" · ");
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : "Your saved preferences";
}

function readPending(): Answers | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    window.sessionStorage.removeItem(PENDING_KEY);
    return raw ? ({ ...EMPTY, ...JSON.parse(raw) } as Answers) : null;
  } catch {
    return null;
  }
}

function keepPending(answers: Answers) {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(answers));
  } catch {
    // Without storage the answers are simply asked again after signing in.
  }
}

export function RecommendationQuiz({ lookup, initial }: { lookup: RecommendationLookup; initial: InitialSearch }) {
  const country = lookup.countries.find((entry) => entry.id === initial.countryId) ?? null;
  const region = country?.regions.find((entry) => entry.id === initial.regionId) ?? null;
  const placeName = region && country ? region.name : country?.name ?? null;
  const steps = useRef(buildSteps(placeName)).current;

  const [phase, setPhase] = useState<Phase>("checking");
  const [saved, setSaved] = useState<Preferences | null>(null);
  const [answers, setAnswers] = useState<Answers>({
    ...EMPTY,
    itemType: initial.itemType ?? "both",
    scope: initial.scope === "selected" ? "selected" : "global",
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [searches, setSearches] = useState(0);
  const lastRun = useRef<{ preferences: Preferences; answers: Answers } | null>(null);

  async function run(preferences: Preferences, current: Answers, remember: boolean) {
    lastRun.current = { preferences, answers: current };
    setPhase("results");
    setOutcome({ kind: "loading" });
    if (remember) {
      // The quiz answers become the account's saved preferences; signed out or failed, the search still runs.
      void fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
        cache: "no-store",
        credentials: "same-origin",
      }).then((response) => { if (response.ok) setSaved(preferences); }).catch(() => {});
    }
    const request = recommendationRequestSchema.safeParse({
      preferences,
      itemType: current.itemType,
      geography: {
        scope: country ? current.scope : "global",
        ...(country ? { countryId: country.id } : {}),
        ...(country && region ? { regionId: region.id } : {}),
      },
      ...(initial.startingItem ? { startingItem: initial.startingItem } : {}),
      limit: 3,
    });
    if (!request.success) {
      setOutcome({ kind: "error", message: "Something in your answers didn’t look right. Please try the quiz again.", retry: false });
      return;
    }
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
      else {
        if (response.status === 401) keepPending(current);
        setOutcome({ kind: "error", ...errorFor(response.status, envelope) });
      }
    } catch {
      setOutcome({ kind: "error", ...errorFor(0, null) });
    }
    setSearches((count) => count + 1);
  }

  // Decide the first screen: a sign-in card, a returning-user card, the quiz, or answers kept from before signing in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on arrival; `run` reads the state it needs.
  useEffect(() => {
    let active = true;
    (async () => {
      let session: SessionState["status"] = "unavailable";
      try {
        const envelope = await readEnvelope<SessionState>(await fetch("/api/session", { cache: "no-store", credentials: "same-origin" }));
        if (envelope?.ok) session = envelope.data.status;
      } catch {}
      let stored: Preferences | null = null;
      if (session === "signed-in") {
        try {
          const response = await fetch("/api/preferences", { cache: "no-store", credentials: "same-origin" });
          const envelope = await readEnvelope<Preferences | null>(response);
          const parsed = response.status === 200 && envelope?.ok && envelope.data ? preferencesSchema.safeParse(envelope.data) : null;
          if (parsed?.success) stored = parsed.data;
        } catch {}
      }
      if (!active) return;
      setSaved(stored);
      const pending = session === "signed-in" ? readPending() : null;
      if (pending) {
        setAnswers(pending);
        void run(toPreferences(pending), pending, true);
      } else if (session === "signed-out") setPhase("gate");
      else if (stored) setPhase("welcome");
      else setPhase("quiz");
    })();
    return () => { active = false; };
  }, []);

  function restart() {
    setAnswers({ ...EMPTY, itemType: initial.itemType ?? "both", scope: initial.scope === "selected" ? "selected" : "global" });
    setStepIndex(0);
    setOutcome({ kind: "idle" });
    setPhase("quiz");
  }

  function advance(next: Answers) {
    setAnswers(next);
    if (stepIndex + 1 < steps.length) setStepIndex(stepIndex + 1);
    else void run(toPreferences(next), next, true);
  }

  if (phase === "checking") return <div className={styles.stage} aria-busy="true" />;

  if (phase === "gate") {
    return (
      <Stage title="Sign in to find your coffee">
        <Deck
          deckKey="gate"
          choices={[{ value: "/login?next=/recommendations", label: "Sign in" }, { value: "/signup", label: "Create account" }]}
          onPick={(value) => { if (value) window.location.assign(value); }}
        />
        <SkipButton onClick={() => setPhase("quiz")}>Skip · sign in later</SkipButton>
      </Stage>
    );
  }

  if (phase === "welcome" && saved) {
    return (
      <Stage title="Welcome back">
        <Deck
          deckKey="welcome"
          choices={[{ value: "saved", label: "Use my taste", swatch: "#865039" }, { value: "quiz", label: "Retake the quiz", swatch: "#d9b8a4" }]}
          captions={{ saved: tasteLine(saved) }}
          onPick={(value) => {
            if (value === "saved") void run(saved, answers, false);
            else restart();
          }}
        />
        <SkipLink href="/recommendations/classic">Edit preferences</SkipLink>
      </Stage>
    );
  }

  if (phase === "results") {
    const last = lastRun.current;
    return (
      <div className={styles.resultsWrap}>
        <h1 className={styles.title}>Your picks</h1>
        {last ? <p className={styles.taste}>{tasteLine(last.preferences)}</p> : null}
        <div className={styles.results} aria-live="polite" aria-busy={outcome.kind === "loading"}>
          <Results
            outcome={outcome}
            lookup={lookup}
            canWiden={false}
            canBroaden={false}
            onRetry={() => { if (last) void run(last.preferences, last.answers, false); }}
            onWiden={() => {}}
            onBroaden={() => {}}
          />
        </div>
        <div className={styles.resultActions}>
          <button type="button" className={styles.skip} onClick={restart}>Retake the quiz</button>
          <Link className={styles.skip} href="/recommendations/classic">Edit preferences</Link>
        </div>
        {outcome.kind === "error" && outcome.action ? null : <AllowanceNote refreshKey={searches} className={styles.allowance} />}
      </div>
    );
  }

  const step = steps[stepIndex];
  const back = stepIndex > 0 ? () => setStepIndex(stepIndex - 1) : null;
  return (
    <Stage title={step.title} progress={`${stepIndex + 1} / ${steps.length}`} onBack={back}>
      {step.kind === "pick" ? (
        <>
          <Deck key={step.id} deckKey={step.id} choices={step.choices} onPick={(value) => advance(step.apply(answers, value))} />
          <SkipButton onClick={() => advance(step.apply(answers, null))}>Skip · edit later</SkipButton>
        </>
      ) : null}
      {step.kind === "methods" ? (
        <MethodsStep
          key={step.id}
          initialMethods={answers.methods}
          onDone={(methods) => advance({ ...answers, methods })}
          onSkip={() => advance({ ...answers, methods: [] })}
        />
      ) : null}
      {step.kind === "notes" ? (
        <NotesStep
          key={step.id}
          initialNotes={answers.notes}
          onDone={(notes) => advance({ ...answers, notes })}
          onSkip={() => advance({ ...answers, notes: "" })}
        />
      ) : null}
    </Stage>
  );
}

function Stage({ title, progress, onBack, children }: { title: string; progress?: string; onBack?: (() => void) | null; children: ReactNode }) {
  return (
    <section className={styles.stage}>
      <div className={styles.topline}>
        {onBack ? <button type="button" className={styles.back} onClick={onBack}>← Back</button> : <span />}
        {progress ? <span className={styles.progress}>{progress}</span> : null}
      </div>
      <h1 key={title} className={styles.title}>{title}</h1>
      {children}
    </section>
  );
}

/** Two or three big cards; the chosen one grows while the others slide away, then `onPick` fires. */
function Deck({ deckKey, choices, captions, onPick }: {
  deckKey: string;
  choices: Choice[];
  captions?: Record<string, string>;
  onPick: (value: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const pickedIndex = choices.findIndex((choice) => choice.value === picked);

  function choose(value: string) {
    if (picked) return;
    setPicked(value);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => onPick(value), reduce ? 0 : LEAVE_MS);
  }

  return (
    <div key={deckKey} className={styles.deck} data-count={choices.length}>
      {choices.map((choice, index) => {
        const state = picked === null ? "idle" : index === pickedIndex ? "chosen" : index < pickedIndex ? "gone-left" : "gone-right";
        return (
          <button
            key={choice.value}
            type="button"
            className={styles.card}
            data-state={state}
            style={{ animationDelay: `${index * 70}ms` }}
            onClick={() => choose(choice.value)}
          >
            {choice.swatch ? <span className={styles.swatch} style={{ background: choice.swatch }} aria-hidden="true" /> : null}
            {choice.level ? (
              <span className={styles.level} aria-hidden="true">
                {[1, 2, 3].map((dot) => <span key={dot} data-on={dot <= (choice.level ?? 0)} />)}
              </span>
            ) : null}
            <span className={styles.label}>{choice.label}</span>
            {captions?.[choice.value] ? <span className={styles.caption}>{captions[choice.value]}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function MethodsStep({ initialMethods, onDone, onSkip }: { initialMethods: Method[]; onDone: (methods: Method[]) => void; onSkip: () => void }) {
  const [methods, setMethods] = useState<Method[]>(initialMethods);
  const toggle = (value: Method) => setMethods((current) => (current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]));
  return (
    <>
      <div className={styles.deck} data-count={4}>
        {METHODS.map((method, index) => (
          <button
            key={method.value}
            type="button"
            className={styles.card}
            data-state={methods.includes(method.value) ? "selected" : "idle"}
            aria-pressed={methods.includes(method.value)}
            style={{ animationDelay: `${index * 70}ms` }}
            onClick={() => toggle(method.value)}
          >
            <span className={styles.label}>{method.label}</span>
          </button>
        ))}
      </div>
      <div className={styles.footer}>
        <button type="button" className="button button-primary" disabled={methods.length === 0} onClick={() => onDone(methods)}>
          Continue<ArrowIcon />
        </button>
        <SkipButton onClick={onSkip}>Skip · edit later</SkipButton>
      </div>
    </>
  );
}

function NotesStep({ initialNotes, onDone, onSkip }: { initialNotes: string; onDone: (notes: string) => void; onSkip: () => void }) {
  const [notes, setNotes] = useState(initialNotes);
  return (
    <>
      <textarea
        className={styles.notes}
        rows={5}
        maxLength={1000}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="e.g. sweet, with oat milk, nothing too sour"
        aria-label="Anything else"
      />
      <div className={styles.footer}>
        <button type="button" className="button button-primary" onClick={() => onDone(notes)}>
          Find my coffee<ArrowIcon />
        </button>
        <SkipButton onClick={onSkip}>Skip</SkipButton>
      </div>
    </>
  );
}

function SkipButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" className={styles.skip} onClick={onClick}>{children}</button>;
}

function SkipLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className={styles.skip} href={href}>{children}</Link>;
}
