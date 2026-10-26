import Link from "next/link";
import type { CatalogIndex, PairingGroups, PairingView } from "@/modules/map-experience/lib/catalog-view";
import { sourcesFor } from "@/modules/map-experience/lib/catalog-view";
import { beanPath, drinkPath } from "@/modules/map-experience/lib/links";
import { beanOriginName, drinkPlacesName } from "./item-cards";
import styles from "./items.module.css";
import { InlineSources } from "./source-list";

type Perspective = "bean" | "drink";

const groupCopy = {
  documented: {
    title: "Documented pairings",
    intro: "Combinations described by the cited sources.",
    badge: "Documented",
  },
  suggested: {
    title: "Suggested pairings",
    intro: "A suggested combination, not a documented tradition.",
    badge: "Suggested",
  },
} as const;

function PairingItem({ view, index, perspective }: { view: PairingView; index: CatalogIndex; perspective: Perspective }) {
  const { pairing } = view;
  const relationship = pairing.relationship;
  // From a bean's page the other side is a drink, and vice versa.
  const other =
    perspective === "bean"
      ? view.drink && {
          name: view.drink.name,
          href: drinkPath(view.drink.id),
          place: drinkPlacesName(index, view.drink),
          placePrefix: "Enjoyed in",
        }
      : view.bean && {
          name: view.bean.name,
          href: beanPath(view.bean.id),
          place: beanOriginName(index, view.bean),
          placePrefix: "Grown in",
        };

  return (
    <li className={styles.pairing} data-relationship={relationship}>
      <div className={styles.pairingTop}>
        <div>
          <h4 className={styles.pairingName}>
            {other ? (
              <Link href={other.href}>{other.name}</Link>
            ) : (
              `${perspective === "bean" ? "Drink" : "Bean"} record unavailable`
            )}
          </h4>
          {other?.place ? (
            <span className={styles.pairingPlace}>
              {other.placePrefix} {other.place}
            </span>
          ) : null}
        </div>
        <span
          className={`${styles.badge} ${relationship === "documented" ? styles.badgeDocumented : styles.badgeSuggested}`}
        >
          {groupCopy[relationship].badge}
        </span>
      </div>
      <p className={styles.pairingExplanation}>{pairing.explanation}</p>
      <InlineSources lookup={sourcesFor(index, pairing.sourceIds)} />
    </li>
  );
}

/**
 * Documented and suggested pairings, kept visibly apart. A pairing describes
 * how a bean and a drink go together; it says nothing about shared origin.
 */
export function PairingList({
  groups,
  index,
  perspective,
}: {
  groups: PairingGroups;
  index: CatalogIndex;
  perspective: Perspective;
}) {
  if (groups.documented.length === 0 && groups.suggested.length === 0) {
    return <p className={styles.empty}>No pairings are recorded for this {perspective} yet.</p>;
  }
  return (
    <>
      {(["documented", "suggested"] as const).map((relationship) => {
        const views = groups[relationship];
        const copy = groupCopy[relationship];
        return (
          <div key={relationship} className={styles.group}>
            <div className={styles.groupHead}>
              <h3>{copy.title}</h3>
              {/* An empty group keeps its heading, so the other kind is still visibly separate. */}
              <p>{views.length > 0 ? copy.intro : `${copy.intro} None recorded yet.`}</p>
            </div>
            {views.length > 0 ? (
              <ul className={styles.pairings}>
                {views.map((view) => (
                  <PairingItem key={view.pairing.id} view={view} index={index} perspective={perspective} />
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
