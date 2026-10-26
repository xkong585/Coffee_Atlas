import { Breadcrumbs } from "@/components/breadcrumbs";
import { buildLookup, type RecommendationLookup } from "@/modules/recommendations/lib/lookup";
import { itemKey } from "@/modules/recommendations/lib/candidates";
import type { RecommendationCatalog } from "@/modules/recommendations/server/catalog-source";
import { CatalogState, StateLink } from "@/modules/map-experience/ui/catalog-state";
import { PreviewNotice } from "@/modules/map-experience/ui/preview-notice";
import { RecommendationForm } from "./recommendation-form";
import { RecommendationQuiz } from "./recommendation-quiz";
import type { InitialSearch } from "./search-context";
import styles from "./recommendations.module.css";

/** Keeps only deep-link references the catalog actually has, so the form never offers a phantom place or item. */
function resolveInitial(initial: InitialSearch, lookup: RecommendationLookup): { search: InitialSearch; dropped: boolean } {
  const country = lookup.countries.find((entry) => entry.id === initial.countryId);
  const regionOk = Boolean(country?.regions.some((region) => region.id === initial.regionId));
  const startOk = initial.startingItem ? Boolean(lookup.items[itemKey(initial.startingItem)]) : false;
  const search: InitialSearch = {
    itemType: initial.itemType,
    countryId: country ? country.id : null,
    regionId: country && regionOk ? initial.regionId : null,
    scope: initial.scope === "selected" && !country ? null : initial.scope,
    startingItem: startOk ? initial.startingItem : null,
  };
  const dropped = (initial.countryId !== null && !country)
    || (initial.regionId !== null && search.regionId === null)
    || (initial.startingItem !== null && !startOk);
  return { search, dropped };
}

/** `quiz` is the default card-by-card questionnaire; `classic` keeps the original one-page form (also the place to edit every answer). */
export function RecommendationScreen({ catalog, initial, variant = "quiz" }: { catalog: RecommendationCatalog; initial: InitialSearch; variant?: "quiz" | "classic" }) {
  return (
    <div className="content-width interior-page">
      <Breadcrumbs items={variant === "classic" ? [{ label: "Find your coffee", href: "/recommendations" }, { label: "All preferences" }] : [{ label: "Find your coffee" }]} />
      {catalog.status === "ready" ? (
        <Ready lookup={buildLookup(catalog.snapshot)} preview={catalog.preview} initial={initial} variant={variant} />
      ) : (
        <div className={styles.stateWrap}>
          <CatalogState
            status={catalog.status}
            headingLevel={1}
            detail={catalog.status === "unavailable"
              ? "Recommendations are chosen only from the atlas catalog, so they’ll appear here once it’s connected."
              : "Recommendations need the catalog. Please try again in a moment."}
          >
            <StateLink href="/explore">Explore the atlas</StateLink>
          </CatalogState>
        </div>
      )}
    </div>
  );
}

function Ready({ lookup, preview, initial, variant }: { lookup: RecommendationLookup; preview: boolean; initial: InitialSearch; variant: "quiz" | "classic" }) {
  const { search, dropped } = resolveInitial(initial, lookup);
  if (variant === "quiz") {
    return (
      <>
        {preview ? <PreviewNotice /> : null}
        <RecommendationQuiz lookup={lookup} initial={search} />
      </>
    );
  }
  return (
    <>
      <header className={styles.intro}>
        <p className="eyebrow">Let your taste lead the way</p>
        <h1>Your next cup starts with you.</h1>
        <p className={styles.lede}>
          Tell us how you like your coffee. We’ll pick beans and regional drinks from the atlas and explain why each one might
          suit you.
        </p>
      </header>
      {preview ? <PreviewNotice /> : null}
      {dropped ? (
        <p className={styles.notice} role="note">
          Part of the link you followed isn’t in the catalog, so we left it out. You can still choose everything below.
        </p>
      ) : null}
      <RecommendationForm lookup={lookup} initial={search} />
    </>
  );
}
