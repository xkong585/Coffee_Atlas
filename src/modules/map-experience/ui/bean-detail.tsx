import { Breadcrumbs } from "@/components/breadcrumbs";
import { BeanIcon, CompassIcon } from "@/components/icons";
import type { Bean } from "@/contracts";
import { type CatalogIndex, pairingsForBean, resolveLocation, sourcesFor } from "@/modules/map-experience/lib/catalog-view";
import { explorePath } from "@/modules/map-experience/lib/links";
import { StateLink } from "./catalog-state";
import { Fact, FactsPanel, NoteChips, NotRecorded, PlaceLink, TextOrNotRecorded, TextValues } from "./detail-parts";
import styles from "./detail.module.css";
import { placeName } from "./format";
import { Section } from "./item-sections";
import { PairingList } from "./pairing-list";
import { PreviewNotice } from "./preview-notice";
import { RecommendLink } from "./recommend-link";
import { SaveAction } from "@/modules/accounts/ui/save-action";
import { SourceList } from "./source-list";

/** Bean profile: where it grows (origin), its profile, pairings and sources. */
export function BeanDetail({ bean, index, preview }: { bean: Bean; index: CatalogIndex; preview: boolean }) {
  const { country, region } = resolveLocation(index, bean.origin);
  const origin = placeName(country, region);

  const crumbs = [{ label: "Explore", href: "/explore" }];
  if (country) crumbs.push({ label: country.name, href: explorePath(country.id) });
  if (country && region) crumbs.push({ label: region.name, href: explorePath(country.id, region.id) });

  return (
    <div className={`content-width interior-page ${styles.enter}`}>
      <Breadcrumbs items={[...crumbs, { label: bean.name }]} />
      {preview ? <PreviewNotice /> : null}
      <div className={styles.layout}>
        <header className={styles.header}>
          <p className="eyebrow">Coffee bean{origin ? ` · Grown in ${origin}` : ""}</p>
          <h1>{bean.name}</h1>
          <p className={styles.lead}>{bean.description}</p>
          <div className={styles.actions}>
            <SaveAction itemType="bean" itemId={bean.id} itemName={bean.name} />
            <RecommendLink
              variant="text"
              context={{
                type: "both",
                scope: "global",
                beanId: bean.id,
                countryId: country?.id,
                regionId: region?.id,
              }}
            >
              Get recommendations like this
            </RecommendLink>
          </div>
        </header>

        <div className={styles.main}>
          <Section
            id="origin-heading"
            eyebrow="Bean origin"
            title="Where it grows"
            icon={<BeanIcon width={16} height={16} />}
            intro="Origin is the place this coffee is grown. It is separate from where any drink made with it is enjoyed."
          >
            <div className={styles.placeBlock}>
              <span className={styles.placeTitle}>{origin ?? "Origin not in the catalog"}</span>
              {region && country ? <span className={styles.placeSub}>A growing region of {country.name}</span> : null}
              {country && !region ? <span className={styles.placeSub}>Recorded at country level</span> : null}
              {country ? (
                <span className={styles.placeLinks}>
                  {region ? <StateLink href={explorePath(country.id, region.id)}>{`Explore ${region.name}`}</StateLink> : null}
                  <StateLink href={explorePath(country.id)}>{`Explore ${country.name}`}</StateLink>
                </span>
              ) : null}
            </div>
            <h3 className={styles.subhead}>Growing conditions</h3>
            <TextOrNotRecorded text={bean.growingConditions} />
          </Section>

          <Section
            id="pairings-heading"
            eyebrow="Beans and drinks"
            title="Pairings"
            icon={<CompassIcon width={16} height={16} />}
            intro="A pairing describes how a bean and a drink go together. It doesn’t mean they come from the same place."
          >
            <PairingList groups={pairingsForBean(index, bean.id)} index={index} perspective="bean" />
          </Section>

          <Section
            id="sources-heading"
            eyebrow="Where this comes from"
            title="Sources"
            intro="Links open the original pages in a new tab."
          >
            <SourceList lookup={sourcesFor(index, bean.sourceIds)} />
          </Section>
        </div>

        <FactsPanel label="Bean profile">
          <Fact label="Origin">
            {country ? (
              <>
                {region ? (
                  <>
                    <PlaceLink href={explorePath(country.id, region.id)}>{region.name}</PlaceLink>,{" "}
                  </>
                ) : null}
                <PlaceLink href={explorePath(country.id)}>{country.name}</PlaceLink>
              </>
            ) : (
              <NotRecorded />
            )}
          </Fact>
          <Fact label="Flavor notes">
            <NoteChips notes={bean.flavorNotes} />
          </Fact>
          <Fact label="Varieties">
            <TextValues values={bean.varieties} />
          </Fact>
          <Fact label="Processing">
            <TextValues values={bean.processingMethods} />
          </Fact>
          <Fact label="Roast">{bean.roastDescription?.trim() ? bean.roastDescription : <NotRecorded />}</Fact>
        </FactsPanel>
      </div>
    </div>
  );
}
