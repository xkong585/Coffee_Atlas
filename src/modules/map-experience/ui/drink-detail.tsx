import { Breadcrumbs } from "@/components/breadcrumbs";
import { CompassIcon, CupIcon } from "@/components/icons";
import type { Country, Drink, Region } from "@/contracts";
import { type CatalogIndex, pairingsForDrink, resolveLocation, sourcesFor } from "@/modules/map-experience/lib/catalog-view";
import { explorePath } from "@/modules/map-experience/lib/links";
import { StateLink } from "./catalog-state";
import { Fact, FactsPanel, NoteChips, NotRecorded, PlaceLink, TextOrNotRecorded, TextValues } from "./detail-parts";
import styles from "./detail.module.css";
import { drinkPlacesName } from "./item-cards";
import { Section } from "./item-sections";
import { PairingList } from "./pairing-list";
import { PreviewNotice } from "./preview-notice";
import { RecommendLink } from "./recommend-link";
import { SaveAction } from "@/modules/accounts/ui/save-action";
import { SourceList } from "./source-list";

interface Association {
  key: string;
  country: Country | null;
  region: Region | null;
  countryId: string;
}

function associationsOf(index: CatalogIndex, drink: Drink): Association[] {
  const seen = new Set<string>();
  const result: Association[] = [];
  for (const place of drink.associatedLocations) {
    const key = `${place.countryId}/${place.regionId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ key, countryId: place.countryId, ...resolveLocation(index, place) });
  }
  return result;
}

/** Drink guide: where it is enjoyed (cultural association), how it is made, pairings and sources. */
export function DrinkDetail({ drink, index, preview }: { drink: Drink; index: CatalogIndex; preview: boolean }) {
  const associations = associationsOf(index, drink);
  const places = drinkPlacesName(index, drink);
  const countries = [...new Map(associations.flatMap((a) => (a.country ? [[a.country.id, a.country] as const] : []))).values()];
  const homeCountry = countries.length === 1 ? countries[0] : null;

  const crumbs = [{ label: "Explore", href: "/explore" }];
  if (homeCountry) crumbs.push({ label: homeCountry.name, href: explorePath(homeCountry.id) });

  return (
    <div className={`content-width interior-page ${styles.enter}`}>
      <Breadcrumbs items={[...crumbs, { label: drink.name }]} />
      {preview ? <PreviewNotice /> : null}
      <div className={styles.layout}>
        <header className={styles.header}>
          <p className="eyebrow">Regional drink{places ? ` · Enjoyed in ${places}` : ""}</p>
          <h1>{drink.name}</h1>
          <p className={styles.lead}>{drink.description}</p>
          <div className={styles.actions}>
            <SaveAction itemType="drink" itemId={drink.id} itemName={drink.name} />
            <RecommendLink variant="text" context={{ type: "both", scope: "global", drinkId: drink.id }}>
              Get recommendations like this
            </RecommendLink>
          </div>
        </header>

        <div className={styles.main}>
          <Section
            id="association-heading"
            eyebrow="Drink association"
            title="Where it’s enjoyed"
            icon={<CupIcon width={16} height={16} />}
            intro="These places are part of this drink’s coffee culture. An association doesn’t identify where the beans in the cup are grown."
          >
            {associations.map((association) => (
              <div key={association.key} className={styles.placeBlock}>
                {association.country ? (
                  <>
                    <span className={styles.placeTitle}>
                      {association.region ? `${association.region.name}, ${association.country.name}` : association.country.name}
                    </span>
                    <span className={styles.placeSub}>
                      {association.region ? `A region of ${association.country.name}` : "Associated with the country as a whole"}
                    </span>
                    <span className={styles.placeLinks}>
                      {association.region ? (
                        <StateLink href={explorePath(association.country.id, association.region.id)}>
                          {`Explore ${association.region.name}`}
                        </StateLink>
                      ) : null}
                      <StateLink href={explorePath(association.country.id)}>{`Explore ${association.country.name}`}</StateLink>
                    </span>
                  </>
                ) : (
                  <>
                    <span className={styles.placeTitle}>Location record unavailable</span>
                    <span className={styles.placeSub}>This association refers to a place that isn’t in the catalog snapshot.</span>
                  </>
                )}
              </div>
            ))}
          </Section>

          <Section id="preparation-heading" eyebrow="In the cup" title="Preparation and culture">
            <h3 className={styles.subhead}>Preparation</h3>
            <TextOrNotRecorded text={drink.preparation} />
            <h3 className={styles.subhead}>Cultural context</h3>
            <TextOrNotRecorded text={drink.culturalContext} />
          </Section>

          <Section
            id="pairings-heading"
            eyebrow="Beans and drinks"
            title="Pairings"
            icon={<CompassIcon width={16} height={16} />}
            intro="A pairing describes how a bean and a drink go together. It doesn’t mean they come from the same place."
          >
            <PairingList groups={pairingsForDrink(index, drink.id)} index={index} perspective="drink" />
          </Section>

          <Section
            id="sources-heading"
            eyebrow="Where this comes from"
            title="Sources"
            intro="Links open the original pages in a new tab."
          >
            <SourceList lookup={sourcesFor(index, drink.sourceIds)} />
          </Section>
        </div>

        <FactsPanel label="Drink profile">
          <Fact label="Associated with">
            {associations.some((association) => association.country) ? (
              <ul className={styles.inlineList}>
                {associations.map((association) =>
                  association.country ? (
                    <li key={association.key}>
                      <PlaceLink
                        href={
                          association.region
                            ? explorePath(association.country.id, association.region.id)
                            : explorePath(association.country.id)
                        }
                      >
                        {association.region
                          ? `${association.region.name}, ${association.country.name}`
                          : association.country.name}
                      </PlaceLink>
                    </li>
                  ) : null,
                )}
              </ul>
            ) : (
              <NotRecorded />
            )}
          </Fact>
          <Fact label="Flavor notes">
            <NoteChips notes={drink.flavorNotes} />
          </Fact>
          <Fact label="Ingredients">
            <TextValues values={drink.ingredients} />
          </Fact>
        </FactsPanel>
      </div>
    </div>
  );
}
