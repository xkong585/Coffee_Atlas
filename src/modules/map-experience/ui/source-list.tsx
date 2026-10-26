import type { SourceLookup } from "@/modules/map-experience/lib/catalog-view";
import { formatAccessed } from "./format";
import styles from "./items.module.css";

function ExternalIcon() {
  return (
    <svg className={styles.externalIcon} width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.5 3.5h-3v9h9v-3M9.5 2.5h4v4M13.5 2.5 7.5 8.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SourceLink({ title, url }: { title: string; url: string }) {
  return (
    <a className={styles.sourceLink} href={url} target="_blank" rel="noopener noreferrer">
      {title}
      <ExternalIcon />
      <span className={styles.srOnly}> (opens in a new tab)</span>
    </a>
  );
}

/**
 * Visible source references for a record. Every source opens in a new tab;
 * an ID that the catalog cannot resolve is reported, never hidden.
 */
export function SourceList({ lookup, emptyText = "No sources are listed for this record." }: { lookup: SourceLookup; emptyText?: string }) {
  if (lookup.found.length === 0 && lookup.missingIds.length === 0) {
    return <p className="small-note">{emptyText}</p>;
  }
  return (
    <ol className={styles.sources}>
      {lookup.found.map((source) => (
        <li key={source.id} className={styles.source}>
          <SourceLink title={source.title} url={source.url} />
          <span className={styles.sourceMeta}>
            {source.publisher ? <span>{source.publisher}</span> : null}
            <span>
              Accessed <time dateTime={source.accessedAt}>{formatAccessed(source.accessedAt)}</time>
            </span>
          </span>
        </li>
      ))}
      {lookup.missingIds.map((id) => (
        <li key={`missing-${id}`} className={`${styles.source} ${styles.sourceMissing}`}>
          <span>Source record unavailable</span>
          <span className={styles.sourceMeta}>
            <span>
              Reference <code>{id}</code> isn’t in the catalog snapshot.
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Compact, inline form for pairings: "Sources: Title ↗, Title ↗". */
export function InlineSources({ lookup }: { lookup: SourceLookup }) {
  if (lookup.found.length === 0 && lookup.missingIds.length === 0) return null;
  return (
    <p className={styles.inlineSources}>
      <span className={styles.inlineSourcesLabel}>{lookup.found.length + lookup.missingIds.length === 1 ? "Source" : "Sources"}</span>
      {lookup.found.map((source) => (
        <SourceLink key={source.id} title={source.title} url={source.url} />
      ))}
      {lookup.missingIds.length > 0 ? (
        <span className={styles.sourceMissingInline}>
          {lookup.missingIds.length === 1 ? "Source record unavailable" : `${lookup.missingIds.length} source records unavailable`}
        </span>
      ) : null}
    </p>
  );
}
