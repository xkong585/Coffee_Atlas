import type { ReactNode } from "react";
import type { Bean, Drink } from "@/contracts";
import { BeanIcon, CupIcon } from "@/components/icons";
import type { CatalogIndex } from "@/modules/map-experience/lib/catalog-view";
import { BeanCards, DrinkCards } from "./item-cards";
import styles from "./items.module.css";

/** A titled block with an eyebrow, a serif heading and a short explanation. */
export function Section({
  id,
  eyebrow,
  title,
  icon,
  intro,
  className,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  icon?: ReactNode;
  intro?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className ? `${styles.section} ${className}` : styles.section} aria-labelledby={id}>
      <div className={styles.sectionHead}>
        {/* The icon sits in the eyebrow so every serif title starts on the same left edge. */}
        <p className={`eyebrow ${styles.eyebrowIcon}`}>
          {icon}
          {eyebrow}
        </p>
        <h2 id={id} className={styles.sectionTitle}>
          {title}
        </h2>
        {intro ? <p className={styles.sectionIntro}>{intro}</p> : null}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

/** Beans whose origin (where they grow) is this location. */
export function GrownHere({ index, beans, place }: { index: CatalogIndex; beans: readonly Bean[]; place: string }) {
  return (
    <Section
      id="grown-here-heading"
      eyebrow="Bean origin"
      title="Grown here"
      icon={<BeanIcon width={16} height={16} />}
      intro={`Coffee beans whose recorded origin is ${place}.`}
    >
      {beans.length > 0 ? (
        <BeanCards beans={beans} index={index} />
      ) : (
        <p className={styles.empty}>No beans grown in {place} are in the catalog yet.</p>
      )}
    </Section>
  );
}

export interface DrinkGroup {
  key: string;
  /** Optional sub-heading, e.g. "Across Ethiopia". */
  heading?: string;
  note?: string;
  /** A group without drinks is skipped. */
  drinks: readonly Drink[];
}

/** Drinks culturally associated with this location. Association is not bean origin. */
export function EnjoyedHere({
  index,
  groups,
  place,
  className,
}: {
  index: CatalogIndex;
  groups: readonly DrinkGroup[];
  place: string;
  className?: string;
}) {
  const visible = groups.filter((group) => group.drinks.length > 0);
  const total = groups.reduce((sum, group) => sum + group.drinks.length, 0);
  return (
    <Section
      id="enjoyed-here-heading"
      eyebrow="Drink association"
      title="Enjoyed here"
      icon={<CupIcon width={16} height={16} />}
      intro={`Drinks associated with coffee culture in ${place}. An association describes where a drink is enjoyed; it doesn’t mean its beans grow here.`}
      className={className}
    >
      {total === 0 ? (
        <p className={styles.empty}>No drinks associated with {place} are in the catalog yet.</p>
      ) : (
        visible.map((group) => (
          <div key={group.key} className={styles.group}>
            {group.heading ? (
              <div className={styles.groupHead}>
                <h3>{group.heading}</h3>
                {group.note ? <p>{group.note}</p> : null}
              </div>
            ) : null}
            <DrinkCards drinks={group.drinks} index={index} />
          </div>
        ))
      )}
    </Section>
  );
}
