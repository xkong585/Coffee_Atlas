"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import type { Preferences, RecommendationAllowance, SavedItem, SessionState } from "@/contracts";
import { callApi, dataOf, messageOf } from "./client";
import { savedState } from "./saved-state";
import styles from "./accounts.module.css";

type Loaded =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "signed-out" }
  | {
    kind: "ready";
    session: Extract<SessionState, { status: "signed-in" }>;
    allowance: RecommendationAllowance | null;
    preferences: Preferences | null;
    savedCount: number | null;
  };

const label = (value: string) => (value === "any" ? "No preference" : value.charAt(0).toUpperCase() + value.slice(1));

function summary(preferences: Preferences): [string, string][] {
  return [
    ["Acidity", label(preferences.acidity)],
    ["Sweetness", label(preferences.sweetness)],
    ["Roast", label(preferences.roast)],
    ["Milk", label(preferences.milk)],
    ["Flavors", preferences.flavors.join(", ") || "None chosen"],
    ["Methods", preferences.preparationMethods.map(label).join(", ") || "None chosen"],
  ];
}

export function AccountPanel() {
  const router = useRouter();
  const [state, setState] = useState<Loaded>({ kind: "loading" });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutProblem, setSignOutProblem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await callApi<SessionState>("/api/session");
      const current = dataOf(session);
      if (!active) return;
      if (!current) return setState({ kind: "unavailable" });
      if (current.status !== "signed-in") return setState({ kind: "signed-out" });
      const [allowance, preferences, saved] = await Promise.all([
        callApi<RecommendationAllowance>("/api/usage"),
        callApi<Preferences | null>("/api/preferences"),
        callApi<SavedItem[]>("/api/saved"),
      ]);
      if (!active) return;
      setState({
        kind: "ready",
        session: current,
        allowance: dataOf(allowance),
        preferences: dataOf(preferences),
        savedCount: dataOf(saved)?.length ?? null,
      });
    })();
    return () => { active = false; };
  }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutProblem(null);
    const reply = await callApi<SessionState>("/api/auth/logout", { method: "POST" });
    if (dataOf(reply)?.status !== "signed-out") {
      setSigningOut(false);
      setSignOutProblem(messageOf(reply, "We couldn’t sign you out. Please try again."));
      return;
    }
    savedState.reset();
    router.push("/");
    router.refresh();
  }

  if (state.kind === "loading") return <p className={`${styles.stack} ${styles.muted}`} role="status">Loading your account…</p>;
  if (state.kind === "unavailable") {
    return <p className={`${styles.message} ${styles.stack}`} data-kind="error">Accounts aren’t available right now. Please try again later.</p>;
  }
  if (state.kind === "signed-out") {
    return (
      <div className={styles.stack}>
        <p className={styles.message}>
          You’re not signed in. <Link className={styles.inlineLink} href="/login?next=/account">Sign in</Link> or{" "}
          <Link className={styles.inlineLink} href="/signup?next=/account">create an account</Link> to keep your preferences and saved coffee.
        </p>
      </div>
    );
  }

  const { user } = state.session;
  const { allowance, preferences } = state;
  return (
    <div className={styles.stack}>
      <section className={styles.card} aria-labelledby="account-details">
        <h2 id="account-details">{user.displayName ?? "Your account"}</h2>
        <dl className={styles.facts}>
          <dt>Email</dt><dd>{user.email}</dd>
          <dt>Saved coffee</dt>
          <dd>{state.savedCount === null ? "—" : <Link className={styles.inlineLink} href="/saved">{state.savedCount} saved</Link>}</dd>
        </dl>
        <div className={styles.row}>
          <button type="button" className={`button ${styles.secondary}`} onClick={signOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
        {signOutProblem ? <p className={styles.message} data-kind="error" role="alert">{signOutProblem}</p> : null}
      </section>

      <section className={styles.card} aria-labelledby="account-plan">
        {allowance?.paid ? <span className={styles.badge}>Unlocked</span> : null}
        <h2 id="account-plan">AI recommendations</h2>
        {allowance === null ? <p className={styles.muted}>Your plan couldn’t be loaded right now.</p>
          : allowance.paid ? <p>Unlimited recommendations are unlocked on your account.</p>
          : (
            <>
              <p>
                {allowance.freeRemaining > 0
                  ? `${allowance.freeRemaining} of ${allowance.freeLimit} free recommendations left.`
                  : `You’ve used all ${allowance.freeLimit} free recommendations.`}
              </p>
              <div className={styles.row}><Link className="button button-primary" href="/upgrade">Unlock unlimited</Link></div>
            </>
          )}
      </section>

      <section className={styles.card} aria-labelledby="account-preferences">
        <h2 id="account-preferences">Taste preferences</h2>
        {preferences ? (
          <dl className={styles.facts}>
            {summary(preferences).map(([term, value]) => (<Fragment key={term}><dt>{term}</dt><dd>{value}</dd></Fragment>))}
          </dl>
        ) : <p className={styles.muted}>No preferences saved yet.</p>}
        <div className={styles.row}>
          <Link className={styles.inlineLink} href="/recommendations">{preferences ? "Change them in Find your coffee" : "Set them in Find your coffee"}</Link>
        </div>
      </section>
    </div>
  );
}
