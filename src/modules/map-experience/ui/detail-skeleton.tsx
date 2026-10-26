import styles from "./detail.module.css";
import itemStyles from "./items.module.css";

/** Label and value widths for each facts row, in the order the profile lists them. */
const factRows = {
  // Origin, flavor notes, varieties, processing, roast
  bean: [
    [44, "58%"],
    [72, "86%"],
    [56, "64%"],
    [64, "40%"],
    [40, "48%"],
  ],
  // Associated with, flavor notes, ingredients
  drink: [
    [96, "52%"],
    [72, "78%"],
    [64, "60%"],
  ],
} as const;

/**
 * Route loading state for a bean or drink page. Quiet blocks sit in the
 * page's own grid (header beside the facts panel), so a click from a card
 * shows the shape of the page instead of the site-wide loading screen.
 */
export function DetailSkeleton({ kind }: { kind: "bean" | "drink" }) {
  return (
    <div className={`content-width interior-page ${styles.skeletonPage}`} role="status" aria-live="polite">
      <span className={itemStyles.srOnly}>{kind === "bean" ? "Loading the bean profile" : "Loading the drink profile"}</span>
      <div aria-hidden="true">
        <div className={styles.skeletonCrumbs}>
          <span className={`${styles.bar} ${styles.skeletonCrumb}`} />
        </div>
        <div className={styles.layout}>
          <div className={styles.header}>
            <span className={`${styles.bar} ${styles.skeletonEyebrow}`} />
            <span className={`${styles.bar} ${styles.skeletonTitle}`} />
            {/* The third line shows on phones only (detail.module.css). */}
            <span className={styles.skeletonLead}>
              <span className={`${styles.bar} ${styles.skeletonLine}`} />
              <span className={`${styles.bar} ${styles.skeletonLine}`} />
              <span className={`${styles.bar} ${styles.skeletonLine}`} />
            </span>
            <span className={styles.skeletonActions}>
              <span className={styles.skeletonButton} />
              <span className={`${styles.bar} ${styles.skeletonAction}`} />
            </span>
          </div>
          <div className={styles.facts}>
            <span className={`${styles.bar} ${styles.skeletonFactsLabel}`} />
            <div className={styles.factList}>
              {factRows[kind].map(([label, value]) => (
                <div key={`${label}-${value}`}>
                  <span className={`${styles.bar} ${styles.skeletonFactLabel}`} style={{ width: label }} />
                  <span className={`${styles.bar} ${styles.skeletonFactValue}`} style={{ width: value }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
