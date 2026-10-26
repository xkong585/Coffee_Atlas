import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowIcon } from "@/components/icons";
import styles from "./notices.module.css";

export type CatalogProblem = "unavailable" | "error";

const headings: Record<CatalogProblem, string> = {
  unavailable: "The coffee catalog isn’t connected yet.",
  error: "We couldn’t load the coffee catalog right now.",
};

/**
 * Honest, calm notice for a catalog that is not connected or failed to load.
 * Pages keep rendering (HTTP 200) around it; nothing here pretends content exists.
 */
export function CatalogState({
  status,
  detail,
  headingLevel = 2,
  children,
}: {
  status: CatalogProblem;
  /** One line on what will appear here (unavailable) or what to do next (error). */
  detail: string;
  headingLevel?: 1 | 2;
  children?: ReactNode;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <section className={styles.state} data-status={status} aria-labelledby="catalog-state-heading">
      <p className="eyebrow">{status === "unavailable" ? "Catalog not connected" : "Something went wrong"}</p>
      <Heading id="catalog-state-heading">{headings[status]}</Heading>
      <p>{detail}</p>
      {children ? <div className={styles.stateActions}>{children}</div> : null}
    </section>
  );
}

/** A quiet text link. Back links point the other way, with the arrow before the text. */
export function StateLink({
  href,
  children,
  direction = "forward",
  scroll,
}: {
  href: string;
  children: ReactNode;
  direction?: "forward" | "back";
  /** Passed to `Link` when set; in-panel explore links leave scrolling to the map. */
  scroll?: boolean;
}) {
  return (
    <Link className="text-link" href={href} scroll={scroll}>
      {direction === "back" ? <ArrowIcon style={{ transform: "scaleX(-1)" }} /> : null}
      {children}
      {direction === "back" ? null : <ArrowIcon />}
    </Link>
  );
}
