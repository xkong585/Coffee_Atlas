import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CatalogState, StateLink } from "./catalog-state";
import styles from "./detail.module.css";
import itemStyles from "./items.module.css";

/** Shared building blocks for the bean and drink detail screens. */

export function NotRecorded() {
  return <span className={styles.notRecorded}>Not recorded</span>;
}

/** A facts row; empty values always render "Not recorded" rather than disappearing. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function TextValues({ values }: { values: readonly string[] }) {
  if (values.length === 0) return <NotRecorded />;
  return (
    <ul className={styles.inlineList}>
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

export function NoteChips({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return <NotRecorded />;
  return (
    <ul className={itemStyles.chips}>
      {notes.map((note) => (
        <li key={note} className={itemStyles.chip}>
          {note}
        </li>
      ))}
    </ul>
  );
}

export function TextOrNotRecorded({ text }: { text: string | null }) {
  return <p className={styles.prose}>{text?.trim() ? text : <NotRecorded />}</p>;
}

export function FactsPanel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <aside className={styles.facts} aria-labelledby="facts-heading">
      <h2 id="facts-heading">{label}</h2>
      <dl className={styles.factList}>{children}</dl>
    </aside>
  );
}

export function PlaceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className={styles.placeLink} href={href}>
      {children}
    </Link>
  );
}

/** Catalog not connected or failed: the page still renders (HTTP 200) with an honest notice. */
export function DetailProblem({ kind, status }: { kind: "bean" | "drink"; status: "unavailable" | "error" }) {
  const isBean = kind === "bean";
  return (
    <div className={`content-width interior-page ${styles.enter}`}>
      <Breadcrumbs items={[{ label: "Explore", href: "/explore" }, { label: isBean ? "Coffee bean" : "Regional drink" }]} />
      <div className={styles.problem}>
        <p className="eyebrow">{isBean ? "Coffee bean" : "Regional drink"}</p>
        <h1>{isBean ? "This bean profile isn’t available right now." : "This drink guide isn’t available right now."}</h1>
        <CatalogState
          status={status}
          detail={
            status === "unavailable"
              ? isBean
                ? "Once the catalog is connected, this page will show where the bean grows, its flavor and processing, its pairings, and its sources."
                : "Once the catalog is connected, this page will show where the drink is enjoyed, how it’s prepared, its pairings, and its sources."
              : "Please try again in a moment, or keep exploring from the world view."
          }
        >
          <StateLink href="/explore">Back to exploring</StateLink>
        </CatalogState>
      </div>
    </div>
  );
}
