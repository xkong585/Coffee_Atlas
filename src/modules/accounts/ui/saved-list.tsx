"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SavedItem } from "@/contracts";
import { SaveAction } from "./save-action";
import { callApi, dataOf } from "./client";
import styles from "./accounts.module.css";

/** Display details for each catalog item, keyed `bean:<id>` / `drink:<id>`, built on the server. */
export type SavedLookup = Record<string, { name: string; href: string; place: string | null }>;

type State = { kind: "loading" } | { kind: "sign-in" } | { kind: "unavailable" } | { kind: "ready"; items: SavedItem[] };

export function SavedList({ lookup }: { lookup: SavedLookup }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    void callApi<SavedItem[]>("/api/saved").then((reply) => {
      if (!active) return;
      const items = dataOf(reply);
      if (items) setState({ kind: "ready", items });
      else setState(reply.status === 401 ? { kind: "sign-in" } : { kind: "unavailable" });
    });
    return () => { active = false; };
  }, []);

  if (state.kind === "loading") return <p className={`${styles.stack} ${styles.muted}`} role="status">Loading your saved coffee…</p>;
  if (state.kind === "sign-in") {
    return (
      <p className={`${styles.message} ${styles.stack}`}>
        <Link className={styles.inlineLink} href="/login?next=/saved">Sign in</Link> to see the beans and drinks you’ve saved.
      </p>
    );
  }
  if (state.kind === "unavailable") {
    return <p className={`${styles.message} ${styles.stack}`} data-kind="error">Saved coffee isn’t available right now. Please try again later.</p>;
  }
  if (state.items.length === 0) {
    return (
      <p className={`${styles.message} ${styles.stack}`}>
        Nothing saved yet. Use <strong>Save</strong> on any bean or drink while you <Link className={styles.inlineLink} href="/explore">explore the atlas</Link>.
      </p>
    );
  }

  return (
    <ul className={styles.savedList}>
      {state.items.map((item) => {
        const key = `${item.itemType}:${item.itemId}`;
        const details = lookup[key];
        return (
          <li key={key} className={styles.savedItem}>
            <div>
              <span className="eyebrow">{item.itemType === "bean" ? "Bean" : "Drink"}</span>
              <h2>{details ? <Link href={details.href}>{details.name}</Link> : "No longer in the catalog"}</h2>
              <p>
                {details?.place ? `${details.place} · ` : ""}
                Saved {new Date(item.savedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </p>
            </div>
            <SaveAction itemType={item.itemType} itemId={item.itemId} itemName={details?.name ?? item.itemId} />
          </li>
        );
      })}
    </ul>
  );
}
