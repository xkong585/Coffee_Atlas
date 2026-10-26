import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import type { CountrySummary, RegionSummary } from "@/modules/map-experience/lib/catalog-view";
import { explorePath, mapKey } from "@/modules/map-experience/lib/links";
import styles from "./explore.module.css";
import { countryOnMap, countsText, regionOnMap } from "./format";

function OffMapLabel() {
  return (
    <span className={styles.offMap} title="No map coordinates are recorded for this place yet.">
      Not on the map
    </span>
  );
}

/**
 * Every curated country, always rendered on the server so the catalog stays
 * browsable without the map. Counts show how much content each place has; the
 * summary is left to each country page, so the list stays about as tall as the map.
 * Every explore link in the panel sets `scroll={false}` and
 * `data-map-key={mapKey(...)}` (the marker's key): the map scrolls the new
 * heading into view itself and highlights the matching marker on hover
 * (explore-map.tsx).
 */
export function CountryList({ countries }: { countries: readonly CountrySummary[] }) {
  return (
    <ol className={styles.places} aria-label="Countries in the atlas">
      {countries.map(({ country, regionCount, beanCount, drinkCount }) => (
        <li key={country.id}>
          <Link
            className={styles.place}
            href={explorePath(country.id)}
            scroll={false}
            data-map-key={mapKey(country.id)}
          >
            <span className={styles.placeHead}>
              <span className={styles.placeName}>{country.name}</span>
              <ArrowIcon width={16} height={16} />
            </span>
            <span className={styles.placeMeta}>
              <span>{countsText({ regionCount, beanCount, drinkCount })}</span>
              {countryOnMap(country) ? null : <OffMapLabel />}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** Regions of one country; the current region (if any) is marked rather than linked. */
export function RegionList({
  countryId,
  regions,
  currentRegionId,
  label,
}: {
  countryId: string;
  regions: readonly RegionSummary[];
  currentRegionId?: string;
  label: string;
}) {
  return (
    <ol className={styles.places} aria-label={label}>
      {regions.map(({ region, beanCount, drinkCount }) => {
        const current = region.id === currentRegionId;
        const content = (
          <>
            <span className={styles.placeHead}>
              <span className={styles.placeName}>{region.name}</span>
              {current ? <span className={styles.currentLabel}>You are here</span> : <ArrowIcon width={16} height={16} />}
            </span>
            <span className={styles.placeMeta}>
              <span>{countsText({ beanCount, drinkCount })}</span>
              {regionOnMap(region) ? null : <OffMapLabel />}
            </span>
            {current ? null : <span className={styles.placeSummary}>{region.summary}</span>}
          </>
        );
        return (
          <li key={region.id}>
            {current ? (
              <div className={`${styles.place} ${styles.placeCurrent}`} aria-current="location">
                {content}
              </div>
            ) : (
              <Link
                className={styles.place}
                href={explorePath(countryId, region.id)}
                scroll={false}
                data-map-key={mapKey(countryId, region.id)}
              >
                {content}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
