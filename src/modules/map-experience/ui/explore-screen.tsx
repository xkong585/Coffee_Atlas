import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { BeanIcon, CompassIcon, CupIcon } from "@/components/icons";
import {
  beansGrownIn,
  type CatalogIndex,
  countrySummaries,
  drinksAssociatedWith,
  drinksInCountry,
  regionBelongsToCountry,
  regionSummaries,
  sourcesFor,
} from "@/modules/map-experience/lib/catalog-view";
import { explorePath } from "@/modules/map-experience/lib/links";
import { toMapCountries, toMapRegions } from "@/modules/map-experience/lib/map-model";
import type { CatalogLoad } from "@/modules/map-experience/server/catalog-loader";
import { CatalogState, StateLink } from "./catalog-state";
import { ExploreMap } from "./explore-map";
import styles from "./explore.module.css";
import { countryOnMap, countsParts, plural, regionOnMap } from "./format";
import { EnjoyedHere, GrownHere, Section } from "./item-sections";
import { CountryList, RegionList } from "./location-lists";
import { PreviewNotice } from "./preview-notice";
import { RecommendLink } from "./recommend-link";
import { SourceList } from "./source-list";

/**
 * Server-rendered exploration screens. The map (a client component) is an
 * enhancement; every location it shows is also listed here, so the catalog
 * stays reachable when WebGL, the map library or the outlines fail.
 */

function Stats({ items }: { items: string[] }) {
  return (
    <ul className={styles.stats} aria-label="Curated content">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Map beside the panel. The map finds the layout by `data-explore-layout` and
 * sets `data-pending` on it while a navigation is in flight (the panel dims),
 * and focuses the new page's `data-explore-heading` on arrival.
 */
function ExploreLayout({ head, map, body }: { head: ReactNode; map: ReactNode; body: ReactNode }) {
  return (
    <div className={styles.layout} data-explore-layout="">
      <header className={styles.head}>{head}</header>
      <div className={styles.map}>{map}</div>
      <div className={styles.body}>{body}</div>
    </div>
  );
}

function SourcesSection({ index, ids, place }: { index: CatalogIndex; ids: readonly string[]; place: string }) {
  return (
    <Section
      id="sources-heading"
      eyebrow="Where this comes from"
      title="Sources"
      className={styles.full}
      intro={`References for the summary of ${place}. Links open the original pages in a new tab.`}
    >
      <SourceList lookup={sourcesFor(index, ids)} />
    </Section>
  );
}

function RelationshipGuide() {
  return (
    <dl className={styles.guide} aria-label="How the atlas connects places, beans and drinks">
      <div>
        <dt>
          <BeanIcon width={22} height={22} />
          Grown here
        </dt>
        <dd>Bean origin: the country or region where a coffee is grown.</dd>
      </div>
      <div>
        <dt>
          <CupIcon width={22} height={22} />
          Enjoyed here
        </dt>
        <dd>Drink association: where a drink belongs to local coffee culture. It doesn’t say where its beans come from.</dd>
      </div>
      <div>
        <dt>
          <CompassIcon width={22} height={22} />
          Pairings
        </dt>
        <dd>Documented pairings are described by cited sources. Suggested pairings are combinations to try, not traditions.</dd>
      </div>
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/* World                                                               */
/* ------------------------------------------------------------------ */

export function ExploreWorldScreen({ load }: { load: CatalogLoad }) {
  const ready = load.status === "ready" ? load : null;
  const summaries = ready ? countrySummaries(ready.index) : [];
  const snapshot = ready?.index.snapshot;
  // Every region, so a click on a country shows its regions while the country page loads.
  const regions = ready ? [...ready.index.countries.keys()].flatMap((id) => toMapRegions(ready.index, id)) : [];

  return (
    <div className="content-width interior-page">
      <Breadcrumbs items={[{ label: "Explore" }]} />
      {ready?.preview ? <PreviewNotice /> : null}
      <ExploreLayout
        head={
          <>
            <p className="eyebrow">The coffee atlas</p>
            <h1 tabIndex={-1} data-explore-heading="">A good cup starts somewhere.</h1>
            <p className={styles.lead}>
              Explore the places where coffee grows and the many ways people make it their own.
              {summaries.length > 0 ? " Choose a country on the map or from the list." : ""}
            </p>
            {snapshot && summaries.length > 0 ? (
              <Stats
                items={[
                  plural(snapshot.countries.length, "country", "countries"),
                  plural(snapshot.regions.length, "region"),
                  plural(snapshot.beans.length, "bean"),
                  plural(snapshot.drinks.length, "drink"),
                ]}
              />
            ) : null}
            <div className={styles.headAction}>
              <RecommendLink context={{ type: "both", scope: "global" }} variant="text">Find coffee from anywhere</RecommendLink>
            </div>
          </>
        }
        map={
          <ExploreMap
            countries={ready ? toMapCountries(ready.index) : []}
            regions={regions}
            focus={{ level: "world" }}
            label="World map of countries with curated coffee content"
          />
        }
        body={
          load.status === "ready" ? (
            <section className={styles.panelBlock} aria-labelledby="countries-heading">
              <div className={styles.panelHeading}>
                <h2 id="countries-heading">Countries with curated content</h2>
                <span>{summaries.length}</span>
              </div>
              {summaries.length > 0 ? (
                <CountryList countries={summaries} />
              ) : (
                <p className={styles.panelNote}>No countries have been published in the catalog yet.</p>
              )}
            </section>
          ) : (
            <CatalogState
              status={load.status}
              detail={
                load.status === "unavailable"
                  ? "Countries, regions, beans and drinks will appear on the map and in this list once the catalog is connected."
                  : "Please try again in a moment. The map shows the base outlines only until the catalog loads."
              }
            />
          )
        }
      />
      <RelationshipGuide />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Country and region: unavailable / error                             */
/* ------------------------------------------------------------------ */

function ExploreProblem({
  status,
  level,
}: {
  status: "unavailable" | "error";
  level: "country" | "region";
}) {
  const noun = level === "country" ? "country" : "region";
  return (
    <div className="content-width interior-page">
      <Breadcrumbs
        items={[
          { label: "Explore", href: "/explore" },
          { label: level === "country" ? "Country" : "Region" },
        ]}
      />
      <div className={styles.problem}>
        <p className="eyebrow">{level === "country" ? "Country guide" : "Region guide"}</p>
        <h1>This {noun} guide isn’t available right now.</h1>
        <CatalogState
          status={status}
          detail={
            status === "unavailable"
              ? `Once the catalog is connected, this page will show the ${noun}’s summary, the beans grown here, the drinks enjoyed here, and their sources.`
              : "Please try again in a moment, or return to the world view."
          }
        >
          <StateLink href="/explore" direction="back">Back to the world view</StateLink>
        </CatalogState>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Country                                                             */
/* ------------------------------------------------------------------ */

export function ExploreCountryScreen({ load, countryId }: { load: CatalogLoad; countryId: string }) {
  if (load.status !== "ready") return <ExploreProblem status={load.status} level="country" />;
  const { index, preview } = load;
  const country = index.countries.get(countryId);
  if (!country) notFound();

  const regions = regionSummaries(index, country.id);
  const beans = beansGrownIn(index, { countryId: country.id });
  const drinks = drinksInCountry(index, country.id);
  const listOnly = regions.filter(({ region }) => !regionOnMap(region)).length;
  // A country in the atlas for its drinks alone (Italy in the preview): no empty Regions or Grown here blocks.
  const drinksOnly = regions.length === 0 && beans.length === 0 && drinks.length > 0;
  const offMapNote = countryOnMap(country) ? null : (
    <p className={styles.panelNote}>{country.name} isn’t placed on the map yet, so the map stays at the world view.</p>
  );

  return (
    <div className="content-width interior-page">
      <Breadcrumbs items={[{ label: "Explore", href: "/explore" }, { label: country.name }]} />
      {preview ? <PreviewNotice /> : null}
      <ExploreLayout
        head={
          <>
            <p className="eyebrow">Country guide</p>
            <h1 tabIndex={-1} data-explore-heading="">{country.name}</h1>
            <p className={styles.lead}>{country.summary}</p>
            <Stats items={countsParts({ regionCount: regions.length, beanCount: beans.length, drinkCount: drinks.length })} />
          </>
        }
        map={
          <ExploreMap
            countries={toMapCountries(index)}
            regions={toMapRegions(index, country.id)}
            focus={{ level: "country", countryId: country.id }}
            label={`Map of ${country.name} and its coffee regions`}
          />
        }
        body={
          <>
            {drinksOnly ? (
              <div className={styles.panelBlock}>
                <p className={`${styles.panelNote} ${styles.panelNoteFirst}`}>
                  No growing regions or beans are recorded for {country.name}. The drinks enjoyed here are listed below.
                </p>
                {offMapNote}
              </div>
            ) : (
              <section className={styles.panelBlock} aria-labelledby="regions-heading">
                <div className={styles.panelHeading}>
                  <h2 id="regions-heading">Regions</h2>
                  <span>{regions.length}</span>
                </div>
                {regions.length > 0 ? (
                  <RegionList countryId={country.id} regions={regions} label={`Regions of ${country.name}`} />
                ) : (
                  <p className={styles.panelNote}>
                    No regions are recorded for {country.name} yet.
                    {beans.length + drinks.length > 0 ? " Everything recorded for the country is listed below." : ""}
                  </p>
                )}
                {listOnly > 0 ? (
                  <p className={styles.panelNote}>
                    {listOnly === 1 ? "One region has" : `${listOnly} regions have`} no map coordinates yet, so{" "}
                    {listOnly === 1 ? "it appears" : "they appear"} in this list only.
                  </p>
                ) : null}
                {offMapNote}
              </section>
            )}
            <div className={styles.actions}>
              <RecommendLink context={{ type: "both", scope: "selected", countryId: country.id }}>
                {`Recommend from ${country.name}`}
              </RecommendLink>
              <StateLink href={explorePath()} direction="back" scroll={false}>Back to the world view</StateLink>
            </div>
          </>
        }
      />
      <div className={styles.below}>
        {drinksOnly ? null : <GrownHere index={index} beans={beans} place={country.name} />}
        <EnjoyedHere
          index={index}
          place={country.name}
          groups={[{ key: "country", drinks }]}
          className={drinksOnly ? styles.full : undefined}
        />
        <SourcesSection index={index} ids={country.sourceIds} place={country.name} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Region                                                              */
/* ------------------------------------------------------------------ */

export function ExploreRegionScreen({
  load,
  countryId,
  regionId,
}: {
  load: CatalogLoad;
  countryId: string;
  regionId: string;
}) {
  if (load.status !== "ready") return <ExploreProblem status={load.status} level="region" />;
  const { index, preview } = load;
  const country = index.countries.get(countryId);
  const region = index.regions.get(regionId);
  if (!country || !region || !regionBelongsToCountry(index, countryId, regionId)) notFound();

  const siblings = regionSummaries(index, country.id);
  const beans = beansGrownIn(index, { countryId: country.id, regionId: region.id });
  const drinks = drinksAssociatedWith(index, { countryId: country.id, regionId: region.id });
  const place = `${region.name}, ${country.name}`;
  // With no drinks of its own, the region shows only the country's (EnjoyedHere
  // skips the empty group), and the note says so instead of an empty box.
  const countryWideOnly = drinks.region.length === 0 && drinks.countryWide.length > 0;
  const countryGroup = {
    key: "country",
    heading: `Across ${country.name}`,
    note: countryWideOnly
      ? `None are tied to ${region.name} specifically; these belong to ${country.name} as a whole.`
      : "Associated with the country as a whole, not this region in particular.",
    drinks: drinks.countryWide,
  };

  return (
    <div className="content-width interior-page">
      <Breadcrumbs
        items={[
          { label: "Explore", href: "/explore" },
          { label: country.name, href: explorePath(country.id) },
          { label: region.name },
        ]}
      />
      {preview ? <PreviewNotice /> : null}
      <ExploreLayout
        head={
          <>
            <p className="eyebrow">Region guide · {country.name}</p>
            <h1 tabIndex={-1} data-explore-heading="">{region.name}</h1>
            <p className={styles.lead}>{region.summary}</p>
            <Stats items={countsParts({ beanCount: beans.length, drinkCount: drinks.region.length })} />
            {regionOnMap(region) ? null : (
              <p className={styles.panelNote}>
                No map coordinates are recorded for {region.name} yet, so the map shows {country.name} instead.
              </p>
            )}
          </>
        }
        map={
          <ExploreMap
            countries={toMapCountries(index)}
            regions={toMapRegions(index, country.id)}
            focus={{ level: "region", countryId: country.id, regionId: region.id }}
            label={`Map of ${region.name} in ${country.name}`}
          />
        }
        body={
          <>
            <section className={styles.panelBlock} aria-labelledby="regions-heading">
              <div className={styles.panelHeading}>
                <h2 id="regions-heading">Regions of {country.name}</h2>
                <span>{siblings.length}</span>
              </div>
              <RegionList
                countryId={country.id}
                regions={siblings}
                currentRegionId={region.id}
                label={`Regions of ${country.name}`}
              />
            </section>
            <div className={styles.actions}>
              <RecommendLink
                context={{ type: "both", scope: "selected", countryId: country.id, regionId: region.id }}
              >{`Recommend from ${region.name}`}</RecommendLink>
              <StateLink href={explorePath(country.id)} direction="back" scroll={false}>{`Back to ${country.name}`}</StateLink>
            </div>
          </>
        }
      />
      <div className={styles.below}>
        <GrownHere index={index} beans={beans} place={place} />
        <EnjoyedHere
          index={index}
          place={place}
          groups={[{ key: "region", drinks: drinks.region }, countryGroup]}
        />
        <SourcesSection index={index} ids={region.sourceIds} place={region.name} />
      </div>
    </div>
  );
}
