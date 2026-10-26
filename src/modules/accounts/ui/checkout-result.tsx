"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CheckoutState } from "@/contracts";
import { callApi, dataOf } from "./client";
import styles from "./accounts.module.css";

type View = "checking" | "granted" | "waiting" | "slow" | "failed" | "expired" | "sign-in" | "unknown";

const POLL_MS = 2000;
const POLL_LIMIT = 15;

/**
 * Shows only what verified Stripe webhooks have recorded. Arriving here from
 * Stripe's redirect does not grant anything; the page polls until the webhook
 * lands, and says so if it is slow.
 */
export function CheckoutResult({ sessionId, canceled }: { sessionId: string | null; canceled: boolean }) {
  const [view, setView] = useState<View>(sessionId ? "checking" : "unknown");

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      attempts += 1;
      const reply = await callApi<CheckoutState>(`/api/checkout/status?sessionId=${encodeURIComponent(sessionId)}`);
      if (!active) return;
      const state = dataOf(reply);
      if (reply.status === 401) return setView("sign-in");
      if (state?.access.allowed) return setView("granted");
      if (state?.status === "failed") return setView("failed");
      if (state?.status === "expired") return setView("expired");
      if (!state && reply.status !== 0 && reply.status < 500) return setView("unknown");
      if (attempts >= POLL_LIMIT) return setView("slow");
      setView("waiting");
      timer = setTimeout(check, POLL_MS);
    };
    void check();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [sessionId]);

  if (canceled && !sessionId) {
    return (
      <div className={styles.stack}>
        <p className={styles.message}>Checkout was canceled. You haven’t been charged and your account hasn’t changed.</p>
        <p><Link className={styles.inlineLink} href="/upgrade">Back to plans</Link></p>
      </div>
    );
  }

  const messages: Record<View, { text: string; kind?: "success" | "error" }> = {
    checking: { text: "Checking your payment with Stripe…" },
    waiting: { text: "Payment received by Stripe. Waiting for its confirmation to reach your account…" },
    slow: { text: "Stripe hasn’t confirmed this payment yet. That can take a few minutes; refresh this page or check your account later. You won’t be charged twice." },
    granted: { text: "Payment confirmed. Unlimited recommendations are unlocked on your account.", kind: "success" },
    failed: { text: "The payment didn’t go through, so nothing was unlocked. You can try again.", kind: "error" },
    expired: { text: "This checkout expired before payment, so nothing was charged or unlocked.", kind: "error" },
    "sign-in": { text: "Sign in with the account you paid from to see this checkout." },
    unknown: { text: "No payment has been confirmed for this account. This page alone never changes your access." },
  };
  const message = messages[view];

  return (
    <div className={styles.stack}>
      <p className={styles.message} data-kind={message.kind} role="status">{message.text}</p>
      <p>
        {view === "granted" ? <Link className="button button-primary" href="/recommendations">Find your coffee</Link> : null}
        {view === "failed" || view === "expired" || view === "unknown" ? <Link className={styles.inlineLink} href="/upgrade">Back to plans</Link> : null}
        {view === "sign-in" ? <Link className={styles.inlineLink} href={`/login?next=${encodeURIComponent(`/checkout/result?session_id=${sessionId ?? ""}`)}`}>Sign in</Link> : null}
      </p>
    </div>
  );
}
