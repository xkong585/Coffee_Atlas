"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FREE_RECOMMENDATION_LIMIT, type RecommendationAllowance } from "@/contracts";
import { callApi, dataOf } from "./client";

type State =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "sign-in" }
  | { kind: "ready"; allowance: RecommendationAllowance };

/**
 * One line telling the user, before they search, whether they can get AI
 * recommendations: sign in first, how many free ones are left, or unlocked.
 * Re-read whenever `refreshKey` changes (after each answer). Shows nothing
 * when accounts are unavailable; the search itself reports that.
 */
export function AllowanceNote({ refreshKey, className }: { refreshKey: number; className?: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey only signals that the quota may have changed.
  useEffect(() => {
    let active = true;
    void callApi<RecommendationAllowance>("/api/usage").then((reply) => {
      if (!active) return;
      const allowance = dataOf(reply);
      if (allowance) setState({ kind: "ready", allowance });
      else setState(reply.status === 401 ? { kind: "sign-in" } : { kind: "hidden" });
    });
    return () => { active = false; };
  }, [refreshKey]);

  if (state.kind === "loading" || state.kind === "hidden") return null;
  if (state.kind === "sign-in") {
    return (
      <p className={className}>
        <Link href="/login?next=/recommendations">Sign in</Link> to get AI recommendations. Your first {FREE_RECOMMENDATION_LIMIT} are free.
      </p>
    );
  }
  const { paid, freeRemaining, freeLimit } = state.allowance;
  if (paid) return <p className={className}>Unlimited recommendations are unlocked on your account.</p>;
  return (
    <p className={className}>
      {freeRemaining > 0
        ? `${freeRemaining} of ${freeLimit} free recommendations left. `
        : `You’ve used your ${freeLimit} free recommendations. `}
      <Link href="/upgrade">Unlock unlimited</Link>
    </p>
  );
}
