"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ArrowIcon } from "@/components/icons";
import type { SessionState } from "@/contracts";
import { callApi, dataOf, messageOf, safeNext } from "./client";
import { savedState } from "./saved-state";
import styles from "./accounts.module.css";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const destination = safeNext(next);
  const other = mode === "login" ? "/signup" : "/login";
  const otherHref = next ? `${other}?next=${encodeURIComponent(destination)}` : other;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("displayName") ?? "").trim();
    if (mode === "signup" && password.length < 8) {
      setProblem("Use a password of at least 8 characters.");
      return;
    }
    setPending(true);
    setProblem(null);
    const reply = await callApi<SessionState>(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
      method: "POST",
      body: mode === "login" ? { email, password } : { email, password, displayName: name || null },
    });
    if (dataOf(reply)?.status === "signed-in") {
      savedState.reset();
      router.push(destination);
      router.refresh();
      return;
    }
    setPending(false);
    setProblem(
      reply.status === 400 && !reply.envelope?.ok && reply.envelope?.error.message === "The request does not match the expected input."
        ? "Check that the email address is valid."
        : messageOf(reply, "We couldn’t reach the server. Check your connection and try again."),
    );
  }

  return (
    <div className={styles.narrow}>
      <form className={styles.form} onSubmit={submit} noValidate={false}>
        {mode === "signup" ? (
          <label className={styles.label}>
            Name <span className={styles.hint}>Optional, shown on your account page</span>
            <input name="displayName" autoComplete="name" maxLength={60} />
          </label>
        ) : null}
        <label className={styles.label}>
          Email
          <input name="email" type="email" autoComplete="email" required maxLength={254} />
        </label>
        <label className={styles.label}>
          Password {mode === "signup" ? <span className={styles.hint}>At least 8 characters</span> : null}
          <input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : 1}
            maxLength={200}
          />
        </label>
        {problem ? <p className={styles.message} data-kind="error" role="alert">{problem}</p> : null}
        <button type="submit" className="button button-primary" disabled={pending}>
          {pending ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
          <ArrowIcon />
        </button>
      </form>
      <p className={styles.switch}>
        {mode === "login" ? "New here? " : "Already have an account? "}
        <Link href={otherHref}>{mode === "login" ? "Create an account" : "Sign in"}</Link>
      </p>
    </div>
  );
}
