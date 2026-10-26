import Link from "next/link";
import type { Bean, Drink } from "@/contracts";
import { ArrowIcon, BeanIcon, CupIcon } from "@/components/icons";
import { type CatalogIndex, resolveLocation } from "@/modules/map-experience/lib/catalog-view";
import { beanPath, drinkPath } from "@/modules/map-experience/lib/links";
import { placeName } from "./format";
import styles from "./items.module.css";

/** Three chips and "+N" fit on one line of the narrowest (230 px) card. */
const MAX_NOTES = 3;

/** "Yirgacheffe, Ethiopia" for a bean's origin; null when the snapshot lacks both records. */
export function beanOriginName(index: CatalogIndex, bean: Bean): string | null {
  const { country, region } = resolveLocation(index, bean.origin);
  return placeName(country, region);
}

/** Readable list of a drink's cultural associations, e.g. "Vietnam" or "Java, Indonesia". */
export function drinkPlacesName(index: CatalogIndex, drink: Drink): string | null {
  const names = new Set<string>();
  for (const place of drink.associatedLocations) {
    const { country, region } = resolveLocation(index, place);
    const name = placeName(country, region);
    if (name) names.add(name);
  }
  if (names.size === 0) return null;
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format([...names]);
}

function Notes({ notes, summary }: { notes: readonly string[]; summary?: string }) {
  if (notes.length === 0) {
    // Drinks often have no notes; their description (two lines) says more than a missing field.
    if (summary?.trim()) return <span className={styles.cardSummary}>{summary}</span>;
    return <span className={styles.cardMuted}>Flavor notes not recorded</span>;
  }
  const shown = notes.slice(0, MAX_NOTES);
  return (
    <ul className={styles.chips} aria-label="Flavor notes">
      {shown.map((note) => (
        <li key={note} className={styles.chip}>
          {note}
        </li>
      ))}
      {notes.length > shown.length ? <li className={styles.chipMore}>+{notes.length - shown.length}</li> : null}
    </ul>
  );
}

function Card({
  href,
  kind,
  meta,
  name,
  notes,
  summary,
}: {
  href: string;
  kind: "bean" | "drink";
  meta: string | null;
  name: string;
  notes: readonly string[];
  /** Shown in place of missing flavor notes. */
  summary?: string;
}) {
  return (
    <li className={styles.cardItem}>
      <Link className={styles.card} href={href}>
        <span className={styles.cardTop}>
          <span className={styles.cardMeta}>{meta ?? (kind === "bean" ? "Origin not recorded" : "Association not recorded")}</span>
          {kind === "bean" ? <BeanIcon width={20} height={20} /> : <CupIcon width={20} height={20} />}
        </span>
        <span className={styles.cardName}>{name}</span>
        <span className={styles.cardBody}>
          <Notes notes={notes} summary={summary} />
        </span>
        <span className={styles.cardAction}>
          {kind === "bean" ? "View bean" : "View drink"}
          <ArrowIcon width={16} height={16} />
        </span>
      </Link>
    </li>
  );
}

export function BeanCards({ beans, index }: { beans: readonly Bean[]; index: CatalogIndex }) {
  return (
    <ul className={styles.cards}>
      {beans.map((bean) => {
        const origin = beanOriginName(index, bean);
        return (
          <Card
            key={bean.id}
            href={beanPath(bean.id)}
            kind="bean"
            meta={origin ? `Grown in ${origin}` : null}
            name={bean.name}
            notes={bean.flavorNotes}
          />
        );
      })}
    </ul>
  );
}

export function DrinkCards({ drinks, index }: { drinks: readonly Drink[]; index: CatalogIndex }) {
  return (
    <ul className={styles.cards}>
      {drinks.map((drink) => {
        const places = drinkPlacesName(index, drink);
        return (
          <Card
            key={drink.id}
            href={drinkPath(drink.id)}
            kind="drink"
            meta={places ? `Enjoyed in ${places}` : null}
            name={drink.name}
            notes={drink.flavorNotes}
            summary={drink.description}
          />
        );
      })}
    </ul>
  );
}
