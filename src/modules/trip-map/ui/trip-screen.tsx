import { Breadcrumbs } from "@/components/breadcrumbs";
import { CatalogState, StateLink } from "@/modules/map-experience/ui/catalog-state";
import { PreviewNotice } from "@/modules/map-experience/ui/preview-notice";
import type { RecommendationCatalog } from "@/modules/recommendations/server/catalog-source";
import { buildTripLookup } from "@/modules/trip-map/lib/lookup";
import { TripPlanner } from "./trip-planner";
import styles from "./trip.module.css";

export function TripScreen({ catalog }: { catalog: RecommendationCatalog }) {
  return (
    <div className="content-width interior-page">
      <Breadcrumbs items={[{ label: "Plan a coffee trip" }]} />
      {catalog.status === "ready" ? (
        <>
          <header className={styles.intro}>
            <p className="eyebrow">Where to drink it</p>
            <h1>Your next coffee trip, drawn on the globe.</h1>
            <p className={styles.lede}>
              Tell us what you like, and we’ll plan a route through the places in the atlas where it grows or is poured, with
              one thing to try at every stop and the reason it suits you.
            </p>
          </header>
          {catalog.preview ? <PreviewNotice /> : null}
          <TripPlanner lookup={buildTripLookup(catalog.snapshot)} />
        </>
      ) : (
        <div className={styles.intro}>
          <CatalogState
            status={catalog.status}
            headingLevel={1}
            detail={catalog.status === "unavailable"
              ? "Trip stops are chosen only from places in the atlas catalog, so the planner opens once it’s connected."
              : "The trip planner needs the catalog. Please try again in a moment."}
          >
            <StateLink href="/explore">Explore the atlas</StateLink>
          </CatalogState>
        </div>
      )}
    </div>
  );
}
